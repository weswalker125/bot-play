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

// Set up dynamodb accessor
const dynamodb = require('aws-sdk/clients/dynamodb');
const docClient = new dynamodb.DocumentClient();

// Authentication instance used for managing access token for bot install and event handling.
const slackAuth = new SlackAuthenticationModule(slackClientCredentials, docClient, ACCESS_TOKEN_TABLE);

/**
 * Lambda event handler
 */
exports.handler = async (event, context, callback) => {
    logger.debug(`Event: ${JSON.stringify(event)}`);
    logger.debug(`Context: ${JSON.stringify(context)}`);

    // Confirm request's validity/origin
    try {
        let verifiedEvent = await slackAuth.verifyRequest(event);
        switch (verifiedEvent.requestPath) {
            // Static HTML endpoint that serves a page with "Install app" button.
            case '/install':
                // HTML response (from template "install") on success
                // Inject the clientId into HTML response.
                context.succeed(ResponseTemplates.install(slackClientCredentials.id));
                break;

            // Endpoint is hit when user installs this App on Slack.
            // Slack will call to verify functionality and provide temporary 
            // code to continue authorization - done by sending it back to 
            // Slack with client id/secret.
            case '/authorized':
                await slackAuth.requestAccessTokenFromSlack(verifiedEvent?.query?.code);
                await slackAuth.storeAccessToken(response);
                // HTML response (from template "authorized") on success
                context.succeed(ResponseTemplates.authorized());
                break;
            
            // All Slack messages (if configured) are send to this endpoint, the app
            // can choose to handle/respond based on custom logic.
            case '/event':
                receiveEvent(verifiedEvent.body || {}, context).then(response => {
                    callback(null, response);
                });
                break;
            default:
                logger.warn(`Unexpected request path: ${verifiedEvent.requestPath}`);
        }
    } catch (err) {
        logger.error(`Failed to handle event: ${error}`)
        callback(null, {
            statusCode: 400,
            headers: {
                'Content-Type': 'text/html'
            },
            body: `Verification failed:  ${error}`
        });
    }
};

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