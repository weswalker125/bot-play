const Bot = function(web) {
	this.web = web;
};

Bot.prototype.process = function(event) {
	// const text = event.text
	// 	.replace(/http[^\s]*/, '')
	// 	.replace(/@[^\s]+/, '');
	
	var reply = null;
	if (event.text.includes("hey")) {
		reply = "hey what?";
	}

	if (reply) {
		console.log(`text: ${event.text}, reply: ${reply}, channel: ${event.channel}`);
		this.web.chat.postMessage(event.channel, reply)
			.catch(error => console.log(`Error posting Slack message: ${error}`));
	}
};

module.exports = Bot;