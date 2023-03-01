const {
	ContextMenuCommandBuilder,
	ApplicationCommandType,
} = require("discord.js");
const translate = require("google-translate-api-x");

module.exports = {
	data: new ContextMenuCommandBuilder()
		.setName("Translate to English")
		.setType(ApplicationCommandType.Message),

	async execute(interaction) {
		await interaction.deferReply({ ephemeral: true });
		const message = interaction.targetMessage.content;
		translate(message, { to: "en" })
			.then((res) => {
				interaction.editReply({
					ephemeral: true,
					content: "```" + res.text + "```",
				});
			})
			.catch((err) => {
				console.log(err);
				interaction.editReply({ ephemeral: true, content: "Error." });
			});
	},
};
