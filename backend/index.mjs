// StarTrace backend API (single AWS Lambda behind an HTTP API).
//
// Endpoints (all under /api, routed from CloudFront):
//   POST /api/visit      { clientId }                     -> register an anonymous searcher
//   POST /api/discovery  { clientId, constellationId }    -> record a global discovery
//   POST /api/feedback   { clientId, message, category }  -> store a feedback message
//   POST /api/event      { clientId, type }               -> count a usage event (daily bucket)
//   POST /api/error      { clientId, message, stack, url }-> record a client-side error
//   GET  /api/stats                                        -> aggregate stats for the dashboard
//
// Data model (single DynamoDB table, keys pk / sk):
//   pk=STATS   sk=TOTAL              { users, discoveries }
//   pk=CONST   sk=<constellationId>  { count }
//   pk=USER    sk=<clientId>         { createdAt }              (existence = unique searcher)
//   pk=FEEDBACK sk=<createdAt>#<id>  { message, category, clientId, createdAt, issueCreated }
//   pk=EVENT   sk=<YYYY-MM-DD>#<type> { count }                 (usage counters per day)
//   pk=ERROR   sk=<createdAt>#<id>   { message, stack, url, ua, expiresAt } (TTL 30 days)
//
// No personal data is stored: clientId is a random anonymous id generated in the browser.

import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'node:crypto';

const TABLE = process.env.TABLE_NAME;
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));

const MAX_FEEDBACK_LENGTH = 500;
const MAX_ID_LENGTH = 64;
const ALLOWED_CATEGORIES = ['star', 'visual', 'bug', 'other'];
// 利用イベントの種類は許可リストで固定(任意文字列でのカーディナリティ爆発を防ぐ)
const ALLOWED_EVENT_TYPES = [
  'trace_hit', // なぞって星座が見つかった
  'trace_notfound', // なぞったが「みつからないね」になった
  'zukan_open',
  'dashboard_open',
  'feedback_open',
  'app_error', // /api/error からも自動加算される
];
const MAX_ERROR_MESSAGE = 300;
const MAX_ERROR_STACK = 1000;
const ERROR_TTL_DAYS = 30;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body: JSON.stringify(body),
  };
}

function parseBody(event) {
  if (!event.body) return {};
  try {
    const raw = event.isBase64Encoded
      ? Buffer.from(event.body, 'base64').toString('utf-8')
      : event.body;
    return JSON.parse(raw);
  } catch {
    return null; // signals malformed JSON
  }
}

function cleanId(value) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, MAX_ID_LENGTH);
}

/** Register a searcher; increments the global user counter only the first time. */
async function registerUser(clientId) {
  if (!clientId) return;
  try {
    await ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: { pk: 'USER', sk: clientId, createdAt: new Date().toISOString() },
        ConditionExpression: 'attribute_not_exists(pk)',
      }),
    );
    // First time we have seen this client -> bump the unique-user counter.
    await ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: 'STATS', sk: 'TOTAL' },
        UpdateExpression: 'ADD #u :one',
        ExpressionAttributeNames: { '#u': 'users' },
        ExpressionAttributeValues: { ':one': 1 },
      }),
    );
  } catch (err) {
    if (err?.name !== 'ConditionalCheckFailedException') throw err;
    // Already registered -> nothing to do.
  }
}

async function handleVisit(body) {
  await registerUser(cleanId(body.clientId));
  return json(200, { ok: true });
}

async function handleDiscovery(body) {
  const clientId = cleanId(body.clientId);
  const constellationId = cleanId(body.constellationId);
  if (!constellationId) return json(400, { error: 'constellationId is required' });

  await registerUser(clientId);

  await Promise.all([
    ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: 'CONST', sk: constellationId },
        UpdateExpression: 'ADD #c :one',
        ExpressionAttributeNames: { '#c': 'count' },
        ExpressionAttributeValues: { ':one': 1 },
      }),
    ),
    ddb.send(
      new UpdateCommand({
        TableName: TABLE,
        Key: { pk: 'STATS', sk: 'TOTAL' },
        UpdateExpression: 'ADD #d :one',
        ExpressionAttributeNames: { '#d': 'discoveries' },
        ExpressionAttributeValues: { ':one': 1 },
      }),
    ),
  ]);

  return json(200, { ok: true });
}

async function handleFeedback(body) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json(400, { error: 'message is required' });
  if (message.length > MAX_FEEDBACK_LENGTH) {
    return json(400, { error: `message must be <= ${MAX_FEEDBACK_LENGTH} characters` });
  }
  const category = ALLOWED_CATEGORIES.includes(body.category) ? body.category : 'other';
  const createdAt = new Date().toISOString();
  const id = randomUUID();

  await ddb.send(
    new PutCommand({
      TableName: TABLE,
      Item: {
        pk: 'FEEDBACK',
        sk: `${createdAt}#${id}`,
        id,
        message: message.slice(0, MAX_FEEDBACK_LENGTH),
        category,
        clientId: cleanId(body.clientId),
        createdAt,
        issueCreated: false,
      },
    }),
  );

  return json(200, { ok: true });
}

/** 日付キー(UTC)。日次バケットの単位 */
function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** 利用イベントの日次カウンタを+1する */
async function bumpEvent(type) {
  await ddb.send(
    new UpdateCommand({
      TableName: TABLE,
      Key: { pk: 'EVENT', sk: `${todayKey()}#${type}` },
      UpdateExpression: 'ADD #c :one',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':one': 1 },
    }),
  );
}

async function handleEvent(body) {
  if (!ALLOWED_EVENT_TYPES.includes(body.type)) {
    return json(400, { error: 'unknown event type' });
  }
  await bumpEvent(body.type);
  return json(200, { ok: true });
}

async function handleError(body) {
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!message) return json(400, { error: 'message is required' });

  const createdAt = new Date().toISOString();
  const id = randomUUID();
  const expiresAt = Math.floor(Date.now() / 1000) + ERROR_TTL_DAYS * 24 * 60 * 60;

  await Promise.all([
    ddb.send(
      new PutCommand({
        TableName: TABLE,
        Item: {
          pk: 'ERROR',
          sk: `${createdAt}#${id}`,
          message: message.slice(0, MAX_ERROR_MESSAGE),
          stack: typeof body.stack === 'string' ? body.stack.slice(0, MAX_ERROR_STACK) : '',
          url: typeof body.url === 'string' ? body.url.slice(0, 200) : '',
          ua: typeof body.ua === 'string' ? body.ua.slice(0, 200) : '',
          clientId: cleanId(body.clientId),
          createdAt,
          expiresAt, // DynamoDB TTL で30日後に自動削除
        },
      }),
    ),
    bumpEvent('app_error'),
  ]);

  return json(200, { ok: true });
}

async function handleStats() {
  const [totals, consts] = await Promise.all([
    ddb.send(new GetCommand({ TableName: TABLE, Key: { pk: 'STATS', sk: 'TOTAL' } })),
    ddb.send(
      new QueryCommand({
        TableName: TABLE,
        KeyConditionExpression: 'pk = :p',
        ExpressionAttributeValues: { ':p': 'CONST' },
      }),
    ),
  ]);

  const constellations = {};
  for (const item of consts.Items ?? []) {
    constellations[item.sk] = item.count ?? 0;
  }

  return json(200, {
    totalUsers: totals.Item?.users ?? 0,
    totalDiscoveries: totals.Item?.discoveries ?? 0,
    constellations,
  });
}

export async function handler(event) {
  const method = event?.requestContext?.http?.method ?? 'GET';
  const path = event?.rawPath ?? '/';

  try {
    if (method === 'GET' && path === '/api/stats') return await handleStats();

    if (method === 'POST') {
      const body = parseBody(event);
      if (body === null) return json(400, { error: 'invalid JSON body' });

      switch (path) {
        case '/api/visit':
          return await handleVisit(body);
        case '/api/discovery':
          return await handleDiscovery(body);
        case '/api/feedback':
          return await handleFeedback(body);
        case '/api/event':
          return await handleEvent(body);
        case '/api/error':
          return await handleError(body);
        default:
          break;
      }
    }

    return json(404, { error: 'not found' });
  } catch (err) {
    console.error('handler error', err);
    return json(500, { error: 'internal error' });
  }
}
