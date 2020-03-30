const
    Logger = require('node-json-logger'),
    SlackAuthenticationModule = require('./authentication.js'),
    Bot = require('./bot.js'),
    Aws = require('aws-sdk'),
    { WebClient } = require('@slack/web-api'),
    ResponseTemplates = require('./templates.js');

// Environment variables
const { ACCESS_TOKEN_TABLE, IS_OFFLINE, LOG_LEVEL, SLACK_APP_CLIENT_ID, SLACK_APP_CLIENT_SECRET, SLACK_APP_SIGNING_SECRET } = process.env;

// Configure logger
const logger = new Logger({ timestamp: false, level: LOG_LEVEL });

const slackClientCredentials = {
    id: SLACK_APP_CLIENT_ID,
    secret: SLACK_APP_CLIENT_SECRET,
    // Signing Secret is used to compute hash of request to verify it's origin.
    signingSecret: SLACK_APP_SIGNING_SECRET
};

// Set up DynamoDB accessor (local or cloud)
const dynamoDb = IS_OFFLINE === 'true' ?
    new Aws.DynamoDB.DocumentClient({
        region: 'localhost',
        endpoint: 'http://localhost:8000'
    }) :
    new Aws.DynamoDB.DocumentClient();

// Authentication instance used for managing access token for bot install and event handling.
const slackAuth = new SlackAuthenticationModule(slackClientCredentials, dynamoDb, ACCESS_TOKEN_TABLE);

/**
 * Lambda event handler
 */
exports.handler = (event, context, callback) => {
    logger.debug(`Event: ${JSON.stringify(event)}`);
    logger.debug(`Context: ${JSON.stringify(context)}`);

    // Confirm request's validity/origin
    slackAuth.verifyRequest(event, slackClientCredentials.signingSecret)
        .then(verifiedEvent => {
            switch (verifiedEvent.requestPath) {
                case '/install':
                    context.succeed(ResponseTemplates.install(slackClientCredentials.id));
                    break;
                case '/authorized':
                    authorized(verifiedEvent.query || {}).then(() => {
                        context.succeed(ResponseTemplates.authorized());
                    });
                    break;
                case '/event':
                    receiveEvent(verifiedEvent.body || {}, context).then(response => {
                        callback(null, response);
                    });
                    break;
                default:
                    logger.warn(`Unexpected request path: ${verifiedEvent.requestPath}`);
            }
        }).catch(error => {
            logger.error(`Failed to handle event: ${error}`)
            callback(null, {
                statusCode: 400,
                headers: {
                    'Content-Type': 'text/html'
                },
                body: `Verification failed:  ${error}`
            });
        })
};

function authorized(query, context) {
    logger.debug(`Query: ${JSON.stringify(query)}`);

    return new Promise((resolve, reject) => {
        slackAuth.requestAccessTokenFromSlack(query.code || {})
            .then(response => slackAuth.storeAccessToken(response))
            .then(resolve)
            .catch(reject);
    });
}

function receiveEvent(body) {
    logger.debug(`Event Body: ${JSON.stringify(body)}`);

    const response = { statusCode: 200 };

    return new Promise((resolve, reject) => {
        switch (body.type) {
            // Auth challenge?
            case 'url_verification':
                response.headers = {
                    'Content-Type': 'application/x-www-form-urlencoded'
                };
                response.body = body.challenge;
                break;
            // An event we're subscribed to has occurred
            case 'event_callback':
                // Get access token to Slack workspace, pass to bot to handle/respond accordingly
                slackAuth.retrieveAccessToken(body.team_id)
                    .then(botAccessToken => handleEvent(body.event, botAccessToken))
                    .catch(error => {
                        logger.error(error);
                        response.statusCode = 500;
                        response.body = error;
                    });
                break;
            default:
                response.statusCode = 500;
                response.body = 'Unexpected event type';
        }
        resolve(response);
    });
}

/**
 * Process the Slack event that was pushed to the app based on Event Subscriptions.
 * @param {*} event 
 * @param {*} token 
 */
function handleEvent(event, token) {
    logger.trace(`Event Body [event]: ${JSON.stringify(event)}`);
    logger.trace(`Token: ${JSON.stringify(token)}`);

    const bot = new Bot(new WebClient(token));
    switch (event.type) {
        case 'message':
            // ignore bot messages (to include ourself).
            if (!(event.subtype && event.subtype === 'bot_message')) {
                bot.process(event);
            }
            break;
        default:
            logger.error('Unexpected event type: ' + event.type);
    }
}