# node-backend
Backend for AbstractPlay using severless lambdas written in node.js and using DynamoDB.

This started from this example:  
```  https://www.serverless.com/blog/node-rest-api-with-serverless-lambda-and-dynamodb```

Running
```sls deploy```
for the first time will create the DynamoDB (it is completely specified in serverless.yml) and deploy the lambdas. On subsequent runs it will just update the lambdas.

If you need to delete (or start over) run ```sls remove```.

Some more useful things:  
```sls invoke local --function query```  
will trigger a "compile" and show you syntax errors without having to deploy and run. It won't run, but at least you can check that it compiles.

After deployment  
```curl -H "Content-Type: application/json" -X GET [my lambda location]/dev/query?query=list_games```  
will return the list of current games if you want a quick sanity check that the deployment succeeded and the DB is reachable.
  
