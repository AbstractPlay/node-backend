# node-backend
Backend for AbstractPlay using severless lambdas written in node.js and using DynamoDB.

This started from this example:
```  https://www.serverless.com/blog/node-rest-api-with-serverless-lambda-and-dynamodb```

## AWS Credentials
Place your credentials for AWS (the aws_access_key_id and aws_secret_access_key) in ~\.aws\credentials under a profile with name AbstractPlayDev and AbstractPlayProd.

## Cognito
Set up a Cognito user group for each of Dev and Prod using all the defaults. Now or after the group is created add an App client. The name doesn't seem to matter, but make sure "Generate client secret" is unchecked. Also uncheck "Enable token revocation", but I don't know if it matters.

After the pool is created copy the arn to serverless.yml for the authQuery function. Under "App client settings" check "Select all" for Enabled Identity Providers. Add Callback and Sign out URLs. For local debugging of the front end use "http://localhost:3000". For dev and prod use https://play.dev.abstractplay.com and https://play.abstractplay.com. Under OAuth 2.0 check "Authorization code grant", "Implicit grant" and "openid". Also select "aws.cognito.signin.user.admin" and "Email" under scopes.

## Deployment
Just commit your code. github actions will deploy automatically (from the develop and main branches). See the scripts in \.github\workflows.
You can run ```npm install``` and ```npm run build``` to see if the TypeScript compiles. If you have a local copy of gameslib you can install it with ```npm install gameslib_tgz_file```.

## DB Schema
All data is in a single table. The primary key (or the first part of the primary key) is like a SQL table.
- **Games** Data for a game
  * pk: GAME
  * sk: \<metaGame\>#\<completedbit\>#\<gameid\>

- **Game Comments** Comments for a game
  * pk: GAMECOMMENTS
  * sk: \<gameid\>

- **Users** User information, including name, id, email, settings, ratings. Also enough info to show Dashboard (so all current games and challenges)
  * pk: USER
  * sk: \<userid\>

  * pk: PUSH
  * sk: \<userid\>

- **User list** List of users (for use when challenging someone). Just name, and userid
  * pk: USERS
  * sk: \<userid\>

- Game Lists
  - **List of completed games** ALL completed games. Not currently used, but might be nice for a "Recently completed games" page that could give people an idea of what games are currently popular. sk is such that we can sort by date (in case you just want to see the top n)
  	- pk: COMPLETEDGAMES
  	- sk: \<timestamp\>#\<gameid\>

  - **List of completed games by metaGame and player** Not used yet. sk is such that we can sort by date (in case you just want to see the top n)
    - pk: COMPLETEDGAMES#\<metaGame\>#\<userid\>
    - sk: \<timestamp\>#\<gameid\>

  - **List of completed games by metaGame** Just enough data to show on the completed games page. Full game gets fetched when clicking on a game.
    - pk: COMPLETEDGAMES#\<metaGame\>
    - sk: \<timestamp\>#\<gameid\>

  - **List of completed games by player** Note that for a game with n players, there will be n items.
    - pk: COMPLETEDGAMES#\<userid\>
    - sk: \<timestamp\>#\<gameid\>

- **Exploration** Game tree for a particular game at a particular move entered by a specific user.
  * pk: GAMEEXPLORATION#\<gameid\>
  * sk: \<userid\>#\<movenumber\>

- **Ratings** Ratings by metaGame. For use by the Ratings page.
  * pk: RATINGS#\<metaGame\>
  * sk: \<userid\>

- **Standing challenges** Standing challenges by metaGame
  * pk: STANDINGCHALLENGE#\<metaGame\>
  * sk: \<challengeid\>

- **Challenges** Details of a challenge. (This is almost certainly overkill, should probably just have left this in the user records, but maybe I'm forgetting something)
  * pk: CHALLENGE
  * sk: \<challengeid\>

- **Meta games** Stats for all metaGames
	* pk: METAGAMES
  * sk: COUNTS

- **Tournaments** List of tournaments that are not completed yet. Either waiting for players to sign up, or ongoing.
  * pk: TOURNAMENT
  * sk: \<tournamentid\>

- **Tournament Player**
  * pk: TOURNAMENTPLAYER
  * sk: \<tournamentid\>#\<division\>#\<playerid\>

- **Tournament Game**
  * pk: TOURNAMENTGAME
  * sk: \<tournamentid\>#\<division\>#\<gameid\>

- **Completed Tournaments** List of tournaments that are not completed yet. Either waiting for players to sign up, or ongoing.
  * pk: COMPLETEDTOURNAMENT
  * sk: \<tournamentid\>

- **Tournament count** Counter for tournaments. Each metaGame + variants combination gets a count. Variants is a pipe delimited concatenation of (sorted) variations.
  * pk: TOURNAMENTSCOUNTER
  * sk: \<metaGame\>#<\variants\>
{ counter, over }