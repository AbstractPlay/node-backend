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
Running
```npm run full-dev```
and
```npm run full-prod```
for the first time will create the DynamoDB and also the lambdas with the back end functionality (it is completely specified in serverless.yml). On subsequent runs it will just update the lambdas (and the DynamoDB is case you made changes).
But don't run this before doing ```npm install```. sls needs to deploy the node_modules folder and unless that has the correct packages stuff don't work. If you are using PowerShell as your Terminal in VSCode, you might need to run `Remove-Item alias:sls` before `sls` will work. By default it is an alias for the `Select-String` PowerShell cmdlet. Or just use `serverless` instead of `sls`.

If you need to delete (or start over) run ```sls remove```. After running `sls deploy`, update the API endpoint in the front end code. If you get the dreaded "blocked by CORS" error, go to API Gateway and for both authQuery and query, under Actions, do "Enable CORS". Then "Deploy API" again. But this is probably fixed now (by just including cors: true in serverless.yml)

Some more useful things:  
```sls invoke local --function query```  
will trigger a "compile" and show you syntax errors without having to deploy and run. It won't run, but at least you can check that it compiles.

After deployment  
```curl -H "Content-Type: application/json" -X GET [my lambda location]/dev/query?query=list_games```  
will return the list of current games if you want a quick sanity check that the deployment succeeded and the DB is reachable.
  
