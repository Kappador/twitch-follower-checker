const vorpal = require("vorpal")();
const fs = require("fs");
let chalk = vorpal.chalk;
let axios = require("axios");
const { setTimeout } = require("timers");
let cfgFile = fs.readFileSync("config.json");
if (!cfgFile) {
  fs.writeFileSync("config.json", "{}");
}
let config = JSON.parse(cfgFile);

if (Object.keys(config).length === 0) {
  this.log(chalk.red("Please run 'setup' to configure the bot"));
}
let latestCursor = null;
if (config.cursor) {
  latestCursor = config.cursor;
}

vorpal
  .command("setup")
  .description("Setup the bot")
  .action(async function (args, callback) {
    const results = await this.prompt([
      {
        type: "input",
        name: "tokens",
        message: "File path to token file ",
        default: "./tokens.txt",
      },
      {
        type: "confirmation",
        name: "printout_mode",
        message: "Do you want the names of your followers printed? (y/n) ",
        default: "y",
      },
    ]);

    if (results) {
      this.log(`\n${chalk.blue("|")} Token File: ${results.tokens}`);
      this.log(`${chalk.blue("|")} Full Print: ${results.printout_mode==="y" ? "Yes" : "No"}\n`);

      const confirmation = await this.prompt([
        {
          type: "confirm",
          name: "confirm",
          message: `Did I read that right? `,
        },
      ]);

      if (!confirmation.confirm) {
        return this.log(chalk.red("X") + " Setup aborted");
      }

      if (results.printout_mode === "y") config.full_print = true;
      else config.full_print = false;

      const tokenFile = fs
        .readFileSync(results.tokens)
        .toString()
        .split("\r\n");
      if (tokenFile.length < 1) {
        return this.log(chalk.red("X") + " Token file is empty");
      }

      config.tokens = [];
      tokenFile.forEach(async (token) => {
        returnChannelInfo(token).then((info) => {
          config.tokens.push({
            login: info.name,
            displayName: info.displayName,
            token,
          });
          fs.writeFileSync("config.json", JSON.stringify(config, null, 2));
          this.log(chalk.green("✓") + " Setup complete");
        });
      });
    }
  });

vorpal
  .command("check")
  .description("Check the revenue of a channel")
  .action(async function () {
    this.log(
      chalk.yellow(
        "Disclaimer: If you checked 35 follower recently, it will show you the next 35, you need to choose 'Clear recent check cursor' to start over"
      )
    );
    let result = await this.prompt([
      {
        type: "list",
        name: "account",
        message: "Select a channel",
        choices: config.tokens.map((token) => token.displayName),
      },
      {
        type: "list",
        default: "0",
        name: "followers",
        message: "Choose bitch",
        choices: [
          { name: "Print out custom amount", value: "0" },
          { name: "Print out 35 follower", value: "1" },
          { name: "Clear recent check cursor", value: "2" },
        ],
      },
    ]);

    result.account = config.tokens.map((token) => {if (token.displayName===result.account) return token})[0];

    if (result.followers == "2") {
      latestCursor = null;
      config.cursor = null;
      fs.writeFileSync("config.json", JSON.stringify(config, null, 2));
      this.log(chalk.green("✓") + " Cleared recent check");
    }

    if (result.followers == "1") {
      let completeData = await returnChannelFollowers(
        result.account,
        latestCursor
      );

      this.log(
        "Followers: " +
          chalk.cyan(
            config.full_print
              ? (completeData.followers
                  .map((f) => " " + f.displayName))
                  .toString()
              : completeData.followers.length
          ) +
          "\n" +
          "Has more: " +
          chalk.cyan(completeData.hasNextPage ? "Yes" : "No")
      );
    }

    if (result.followers == "0") {

      const result2 = await this.prompt([
        {
          type: "input",
          name: "amount",
          message: "Amount of followers to print out",
          default: "35",
        },
      ]);

      let completeData = await returnChannelFollowers(
        result.account,
        latestCursor,
        result2.amount
      );

      this.log(
        "Followers: " +
          chalk.cyan(
            config.full_print
              ? (completeData.followers
                  .map((f) => " " + f.displayName))
                  .toString()
              : completeData.followers.length
          ) +
          "\n" +
          "Has more: " +
          chalk.cyan(completeData.hasNextPage ? "Yes" : "No")
      );
    }
  });
function getTwitchHeader(token = "") {
  const header = {
    Accept: "*/*",
    "Accept-Encoding": "gzip, deflate, br",
    "Accept-Language": "en-US",
    Authorization: "undefined",
    "Client-ID": "kimne78kx3ncx6brgo4mv6wki5h1ko",
    Connection: "keep-alive",
    "Content-Type": "text/plain; charset=UTF-8",
    "Device-ID": "pkXjq7q8Qownz1owUogMDR9xKbxiCrC2",
    Origin: "https://www.twitch.tv",
    Referer: "https://www.twitch.tv/",
    Authorization: "OAuth " + token,
    "Sec-Fetch-Dest": "empty",
    "Sec-Fetch-Mode": "cors",
    "Sec-Fetch-Site": "same-site",
    "Sec-GPC": "1",
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/103.0.5060.114 Safari/537.36",
  };
  return header;
}
async function returnChannelInfo(token) {
  return new Promise((resolve, reject) => {
    axios
      .post(
        "https://gql.twitch.tv/gql",
        [
          {
            operationName: "Settings_ProfilePage_AccountInfoSettings",
            variables: {},
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash:
                  "60a54ebcbd29e095db489ed6268f33d5fe5ed1d4fa3176668d8091587ae81779",
              },
            },
          },
        ],
        {
          headers: getTwitchHeader(token),
        }
      )
      .then((response) => {
        resolve({
          name: response.data[0].data.currentUser.login,
          displayName: response.data[0].data.currentUser.displayName,
          id: response.data[0].data.currentUser.id,
        });
      });
  });
}

async function returnChannelFollowers(token, cursor = null, count = null) {
  return new Promise((resolve, reject) => {
    axios
      .post(
        "https://gql.twitch.tv/gql",
        [
          {
            operationName: "Followers",
            variables: {
              cursor: cursor,
              limit: parseInt(count) || 35,
              login: token.login,
              order: "DESC",
            },
            extensions: {
              persistedQuery: {
                version: 1,
                sha256Hash:
                  "deaf3a7c3227ae1bfb950a3d3a2ba8bd47a01a5b528c93ae603c20427e1d829d",
              },
            },
          },
        ],
        {
          headers: getTwitchHeader(token.token),
        }
      )
      .then((response) => {
        let followers = response.data[0].data.user.followers;
        let data = {
          followers: followers.edges.map((follower) => {
            return {
              displayName: follower.node.displayName,
              id: follower.node.id,
            };
          }),
          lastCursor: followers.edges[followers.edges.length - 1].cursor,
          hasNextPage: followers.pageInfo.hasNextPage,
        };
        latestCursor = data.lastCursor;
        config.cursor = latestCursor;
        fs.writeFileSync("config.json", JSON.stringify(config, null, 2));
        resolve(data);
      });
  });
}

vorpal.delimiter("followerchecker$").show();
