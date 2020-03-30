const Logger = require('node-json-logger'),
    axios = require('axios'),
    moment = require('moment'),
    states = require('./states.json');

// Environment variables
const { LOG_LEVEL } = process.env;

// Configure logger
const logger = new Logger({ timestamp: false, level: LOG_LEVEL });

Array.prototype.contains = function(obj) {
    var i = this.length;
    while (i--) {
        if (this[i] === obj) {
            return true;
        }
    }
    return false;
}

const Covid = function() {};

/**
 * Look up statistics on COVID-19 outbreak via public APIs, reply to user.
 * userId is Slack message's event.user, paramString expects {country} {province}
 */
Covid.prototype.stats = (userId, paramString) => {
    logger.debug(`Getting Covid stats for [${userId}], params: [${paramString}]`);
    var reply = null;
    var words = paramString.split(" ");

    if (words.length < 1) {
        reply = "Give me a country, like `!covid {country} {province}` or `!covid China`";
        this.respond(event, reply);
    } else {
        var country = words[0];
        var province = words.slice(1).join(' ');
        var url = `https://${process.env.COVID_API_HOST}/v1/stats`;
        var apiParams = {};
        
        // For US, check that province is an abbrev, or get approprate value.
        if (country.toLowerCase() === 'us') {
            url = 'https://covidtracking.com/api'
            url += '/states';

            var match = states.filter(x => x.abbreviation === province.toUpperCase());
            if (match.length === 0) {
                // Find by name
                match = states.filter(x => x.name.toUpperCase() === province.toUpperCase());

                if (match.length === 0) {
                    logger.error(`Unable to match state with [${province.toUpperCase()}]`);
                }
            }
            apiParams['state'] = match[0].abbreviation;

            // Date-specific?
            if (words.contains('today')) {
                logger.debug('Requested stats for today!');
                apiParams['date'] = moment(new Date()).format('YYYYMMDD');
            } else if (words.contains('yesterday')) {
                logger.debug('Requested stats for yesterday!');
                apiParams['date'] = moment(new Date()).subtract(1, 'days').format('YYYYMMDD');
            }

            logger.debug(`URL: ${url}; Country: ${country}; Params: ${JSON.stringify(apiParams)}`);
            return axios({
                "method": 'GET',
                "url": url,
                "params": apiParams
            })
            .then((response) => {
                logger.debug(`Response: ${JSON.stringify(response.data)}`);
                return `<@${userId}>,
                *State*: ${response.data.state}
                *People Tested*: ${response.data.totalTestResults}
                *Confirmed cases*: ${response.data.positive}
                *Hospitalized*: ${response.data.hospitalized}
                *Deaths*: ${response.data.death}

                _Report date_: ${response.data.dateModified}
                `;
            });
        } else {
            // Use rapidAPI (don't have replacement yet).
            apiParams['country'] = country;
            if (province) {
                apiParams['province'] = province;
            }

            logger.debug(`URL: ${url}; Country: ${country}; Params: ${JSON.stringify(apiParams)}`);
            return axios({
                "method": 'GET',
                "url": url,
                "params": apiParams,
                "responseType": 'application/octet-stream',
                "headers": { "content-type": "application/octet-stream", "x-rapidapi-host": process.env.COVID_API_HOST, "x-rapidapi-key": process.env.COVID_API_KEY }
            })
            .then((response) => {
                logger.debug(`Response: ${JSON.stringify(response.data)}`);

                if (response.data.statusCode === 200) {
                    var covidStats = response.data.data.covid19Stats;
                    var totals = {};
                    if (province !== '') {
                        // Filter down to province, report on it.
                        totals = response.data
                    } else {
                        // Find sum totals
                        totals = {
                            deaths: covidStats.reduce((prev, cur) => { return prev + cur.deaths }, 0),
                            confirmed: covidStats.reduce((prev, cur) => { return prev + cur.confirmed }, 0),
                            recovered: covidStats.reduce((prev, cur) => { return prev + cur.recovered }, 0),
                            lastUpdate: covidStats.find(x => x.lastUpdate).lastUpdate,
                            province: '',
                            country: covidStats.find(x => x.country).country
                        };
                    }

                    return `<@${userId}>,
                    *Location*: ${totals.province}${totals.province !== '' ? ',' : ''} ${totals.country}
                    *Confirmed cases*: ${totals.confirmed}
                    *Recovered*: ${totals.recovered}
                    *Deaths*: ${totals.deaths}

                    _Report date_: ${totals.lastUpdate}
                    _Note that non-US stats are less reliable._
                    `;
                } else {
                    return 'DEAD.';
                }
            })
        }
    }
};

module.exports = new Covid();