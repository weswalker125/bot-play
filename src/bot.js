const Bot = function(web) {
	this.web = web;
};

Bot.prototype.process = function(event) {
	const text = event.text
		.replace(/http[^\s]*/, '')
		.replace(/@[^\s]+/, '');
	
	var reply = "kthx";
	if (text.includes("hey")) {
		reply = "hey what?";
	}
	console.log(`text: ${text}, reply: ${reply}, channel: ${event.channel}`);
	this.web.chat.postMessage(event.channel, reply)
		.catch(error => console.log(`Error posting Slack message: ${error}`));
};

module.exports = Bot;