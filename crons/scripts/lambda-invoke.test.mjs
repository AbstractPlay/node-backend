import assert from "node:assert/strict";
import test from "node:test";
import { cronsLambdaFunctionName, CRONS_LAMBDA_SERVICE } from "./lambda-invoke.mjs";

test("cronsLambdaFunctionName matches Serverless naming", () => {
    assert.equal(CRONS_LAMBDA_SERVICE, "abstract-play-backend-crons");
    assert.equal(
        cronsLambdaFunctionName("prod", "records"),
        "abstract-play-backend-crons-prod-records",
    );
    assert.equal(
        cronsLambdaFunctionName("dev", "summarize"),
        "abstract-play-backend-crons-dev-summarize",
    );
});
