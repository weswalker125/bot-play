const
    Logger = require('node-json-logger'),
    logger = new Logger({ timestamp: false }),
    SlackAuthenticationModule = require('./authentication.js'),
    Bot = require('./bot.js'),
    aws = require('aws-sdk'),
    { WebClient } = require('@slack/web-api'),
    responseTemplates = require('./templates.js');

const { ACCESS_TOKEN_TABLE, IS_OFFLINE } = process.env;
const client = {
    id: process.env.SLACK_APP_CLIENT_ID,
    secret: process.env.SLACK_APP_CLIENT_SECRET,
    // Signing Secret is used to compute hash of request to verify it's origin.
    signingSecret: process.env.SLACK_APP_SIGNING_SECRET
};

// Set up DynamoDB accessor (local or cloud)
const dynamoDb = IS_OFFLINE === 'true' ?
    new aws.DynamoDB.DocumentClient({
        region: 'localhost',
        endpoint: 'http://localhost:8000'
    }) :
    new aws.DynamoDB.DocumentClient();

const auth = new SlackAuthenticationModule(client, dynamoDb, ACCESS_TOKEN_TABLE);
/**
 * Lambda event handler
 */
exports.handler = (event, context, callback) => {
    logger.debug(`Event: ${JSON.stringify(event)}`);
    logger.debug(`Context: ${JSON.stringify(context)}`);
    
    // Confirm request's validity/origin
    auth.verifyRequest(event, client.signingSecret).then(verifiedEvent => {
        switch(verifiedEvent.requestPath) {
            case '/install':
                context.succeed(responseTemplates.install(client.id));
                break;
            case '/authorized':
                authorized(verifiedEvent.query || {}).then(() => {
                    context.succeed(responseTemplates.authorized());
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
    }).catch(reason => {
        callback(null, {
            statusCode: 400,
            headers: {
                'Content-Type': 'text/html'
            },
            body: `Verification failed:  ${reason}`
        });
    })
};

function authorized(query, context) {
    logger.debug(`Query: ${JSON.stringify(query)}`);

    return new Promise((resolve, reject) => {
        auth.requestAccessTokenFromSlack(query.code || {})
            .then(response => auth.storeAccessToken(response))
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
                auth.retrieveAccessToken(body.team_id)
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
    logger.debug(`Event Body [event]: ${JSON.stringify(event)}`);
    logger.debug(`Token: ${JSON.stringify(token)}`);
    
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