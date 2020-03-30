/**
 * DISCLAIMER: there is no "this" in arrow functions... do not
 * refactor the prototype methods as arrow functions as they lose their scope.
 */
const
	https = require('https'),
	Logger = require('node-json-logger');

// Environment variables
const { LOG_LEVEL } = process.env;

// Configure logger
const logger = new Logger({ timestamp: false, level: LOG_LEVEL });

/**
 * 
 * @param {aws.DynamoDB.DocumentClient} database - database accessor.
 * @param {String} tableName - Table to store authentication tokens.
 */
function SlackAuthenticationModule(client, database, tableName) {
	var client = client;
	var database = database;
	var tableName = tableName;

	// public methods
	this.getClient = function() { return client; }
	this.getDatabase = function() { return database; }
	this.getTable = function() { return tableName; }
}

/**
 * Authorize endpoint triggers exchange for OAuth token
 */
SlackAuthenticationModule.prototype.requestAccessTokenFromSlack = function(code) {
	logger.trace(`id: ${this.getClient().id}, secret: ${this.getClient().secret}, code: ${code}`);

	return new Promise((resolve, reject) => {
		https.get(`https://slack.com/api/oauth.access?client_id=${this.getClient().id}&client_secret=${this.getClient().secret}&code=${code}`, response => {
			var body = '';
			response.on('data', chunk => body += chunk);
			response.on('end', () => {
				const jsonBody = JSON.parse(body);
				logger.debug(`Response body: ${body}`);
				resolve(jsonBody);
			});
		});
	});
};

/**
 * Get Access Token from database.
 * Operation required for posting messages to Slack.
 */
SlackAuthenticationModule.prototype.retrieveAccessToken = function(teamId) {
	logger.debug(`Retrieving access token for team ${teamId} in table ${this.getTable()}`);
	const params = {
		TableName: this.getTable(),
		Key: {
			teamId: teamId
		}
	};

	return new Promise((resolve, reject) => {
		// When running local just resolve (mocked).
		if (process.env.IS_OFFLINE) {
			resolve('good');
		} else {
			this.getDatabase().get(params).promise()
				.then(result => resolve(result.Item.botAccessToken))
				.catch(error => reject(new Error(`Error retrieving OAuth access token: ${error}`)));
		}
	});
};

/**
 * Save the provided access token to the database.
 */
SlackAuthenticationModule.prototype.storeAccessToken = function(payload) {
	logger.trace(`Access Token Payload: ${payload}`);
	logger.debug(`Storing access token for team ${payload.team_id} in table ${this.getTable()}`);
	const params = {
		TableName: this.getTable(),
		Item: {
			teamId: payload.team_id,
			teamName: payload.team_name,
			botAccessToken: payload.bot['bot_access_token'],
			scope: payload.scope
		}
	};

	return new Promise((resolve, reject) => {
		if (!payload.bot['bot_access_token']) {
			reject('No access token provided.');
		}
		this.getDatabase().put(params).promise()
			.then(resolve)
			.catch(error => reject(new Error(`Error storing OAuth access token: ${error}`)));
	});
};

SlackAuthenticationModule.prototype.verifyRequest = (request, signingSecret) => {
	return new Promise((resolve, reject) => {
		if (process.env.IS_OFFLINE) {
			logger.debug('Request verification skipped for local execution.');
			resolve(request);
		} else {
			// Confirm recent timestamp (avoid replay-attacks)
			let time = Math.floor(new Date().getTime()/1000);
			let timestamp = request.headers['X-Slack-Request-Timestamp'];
			if (Math.abs(time - timestamp) > 300) {
				reject("Invalid request due to timestamp.");
			}

			// Check for Signing Secret (so we can compute signature)
			if (!signingSecret) {
				reject("Slack signing secret is not set.");
			}

			// TODO: fix later

			// Compute and verify signature
			// let slackSig = request.headers['X-Slack-Signature'];
			// let requestBody = qs.stringify(request.body, { format: qs.formats.RFC1738 })
			
			// let sigBasestring = 'v0:' + timestamp + ':' + request.body;
			// let mySignature = 'v0=' + crypto.createHmac('sha256', signingSecret)
			// 					.update(sigBasestring, 'utf8')
			// 					.digest('hex');
			
			

			// if ( !(crypto.timingSafeEqual(Buffer.from(mySignature, 'utf8'), Buffer.from(slackSig, 'utf8'))) ) {
			// 	reject('Request signature did not match. ' + JSON.stringify({ slackSig: slackSig, computedSig: mySignature }));
			// }

			resolve(request);
		}
	});
    
};

module.exports = SlackAuthenticationModule;