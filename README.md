# node-backend
Backend for AbstractPlay using severless lambdas written in node.js and using DynamoDB.

This started from this example:  
```  https://www.serverless.com/blog/node-rest-api-with-serverless-lambda-and-dynamodb```

Running
```sls deploy```
for the first time will create the DynamoDB (it is completely specified in serverless.yml) and deploy the lambdas. On subsequent runs it will just update the lambdas.
But don't run this before doing ```npm install```. sls needs to deploy the node_modules folder and unless that has the correct packages stuff don't work. If you are using PowerShell as your Terminal in VSCode, you might need to run `Remove-Item alias:sls` before `sls` will work. By default it is an alias for the `Select-String` PowerShell cmdlet.

If you need to delete (or start over) run ```sls remove```. After running `sls deploy`, update the API endpoint in the front end code. If you get the dreaded "blocked by CORS" error, go to API Gateway and for both authQuery and query, under Actions, do "Enable CORS". Then "Deploy API" again. But this is probably fixed now (by just including cors: true in serverless.yml)

Some more useful things:  
```sls invoke local --function query```  
will trigger a "compile" and show you syntax errors without having to deploy and run. It won't run, but at least you can check that it compiles.

After deployment  
```curl -H "Content-Type: application/json" -X GET [my lambda location]/dev/query?query=list_games```  
will return the list of current games if you want a quick sanity check that the deployment succeeded and the DB is reachable.
  
