import { ddbDocClient } from '../ddb.js';
import { s3Client } from '../api/clients.js';
import { headers } from '../api/http.js';
import { feedbackErrorResponse } from '../api/feedbackHttp.js';
import { logGetItemError } from '../api/http.js';
import { isFeedbackAdmin } from './isFeedbackAdmin.js';
import {
  feedbackAdminList,
  feedbackComment,
  feedbackCreate,
  feedbackDelete,
  feedbackGet,
  feedbackHoldRetention,
  feedbackMerge,
  feedbackMine,
  feedbackPresignUpload,
  feedbackReclassify,
  feedbackSetAdminFields,
  feedbackSetStatus,
  feedbackSubscribe,
  feedbackUpdate,
  feedbackVote,
  feedbackTagVocabList,
  feedbackSetTagVocab,
  type FeedbackAdminListPars,
  type FeedbackCommentPars,
  type FeedbackCreatePars,
  type FeedbackDeletePars,
  type FeedbackGetPars,
  type FeedbackHoldRetentionPars,
  type FeedbackMergePars,
  type FeedbackMinePars,
  type FeedbackPresignUploadPars,
  type FeedbackReclassifyPars,
  type FeedbackSetAdminFieldsPars,
  type FeedbackSetStatusPars,
  type FeedbackSubscribePars,
  type FeedbackUpdatePars,
  type FeedbackSetTagVocabPars,
  type FeedbackVotePars,
} from './index.js';

export async function feedbackTagVocabAuth(_userId: string) {
  try {
    const result = await feedbackTagVocabList(ddbDocClient, process.env.FEEDBACK_TABLE);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to load feedback tag vocabulary.');
  }
}

export async function feedbackSetTagVocabAuth(userId: string, pars: FeedbackSetTagVocabPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const result = await feedbackSetTagVocab(ddbDocClient, process.env.FEEDBACK_TABLE, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to update feedback tag vocabulary.');
  }
}

export async function feedbackHoldRetentionAuth(userId: string, pars: FeedbackHoldRetentionPars) {
  try {
    const result = await feedbackHoldRetention(ddbDocClient, process.env.FEEDBACK_TABLE, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to update retention hold.');
  }
}

export async function feedbackGetAuth(userId: string, pars: FeedbackGetPars) {
  try {
    const result = await feedbackGet(
      ddbDocClient,
      process.env.FEEDBACK_TABLE,
      s3Client,
      pars,
      userId,
    );
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse('Unable to load feedback item.');
  }
}

export async function feedbackPresignUploadAuth(userId: string, pars: FeedbackPresignUploadPars) {
  try {
    const result = await feedbackPresignUpload(s3Client, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to presign upload for ${userId}`);
  }
}

export async function feedbackSubscribeAuth(userId: string, pars: FeedbackSubscribePars) {
  try {
    const result = await feedbackSubscribe(ddbDocClient, process.env.FEEDBACK_TABLE, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to update subscription for ${userId}`);
  }
}

export async function feedbackSetStatusAuth(userId: string, pars: FeedbackSetStatusPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const result = await feedbackSetStatus(ddbDocClient, process.env.FEEDBACK_TABLE, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to set feedback status for ${userId}`);
  }
}

export async function feedbackReclassifyAuth(userId: string, pars: FeedbackReclassifyPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const result = await feedbackReclassify(ddbDocClient, process.env.FEEDBACK_TABLE, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to reclassify feedback for ${userId}`);
  }
}

export async function feedbackUpdateAuth(userId: string, pars: FeedbackUpdatePars) {
  try {
    const isAdmin = await isFeedbackAdmin(userId);
    const result = await feedbackUpdate(
      ddbDocClient,
      process.env.FEEDBACK_TABLE,
      s3Client,
      userId,
      pars,
      isAdmin,
    );
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to update feedback for ${userId}`);
  }
}

export async function feedbackSetAdminFieldsAuth(userId: string, pars: FeedbackSetAdminFieldsPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const result = await feedbackSetAdminFields(ddbDocClient, process.env.FEEDBACK_TABLE, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to set feedback admin fields for ${userId}`);
  }
}

export async function feedbackMineAuth(userId: string, pars: FeedbackMinePars) {
  try {
    const result = await feedbackMine(ddbDocClient, process.env.FEEDBACK_TABLE, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to list feedback for ${userId}`);
  }
}

export async function feedbackAdminListAuth(userId: string, pars: FeedbackAdminListPars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const result = await feedbackAdminList(ddbDocClient, process.env.FEEDBACK_TABLE, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to list feedback for admin ${userId}`);
  }
}


export async function feedbackMergeAuth(userId: string, pars: FeedbackMergePars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const result = await feedbackMerge(ddbDocClient, process.env.FEEDBACK_TABLE, s3Client, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to merge wishlist items for ${userId}`);
  }
}

export async function feedbackDeleteAuth(userId: string, pars: FeedbackDeletePars) {
  try {
    if (!(await isFeedbackAdmin(userId))) {
      return feedbackErrorResponse('admin access required.', 403);
    }
    const result = await feedbackDelete(
      ddbDocClient,
      process.env.FEEDBACK_TABLE,
      s3Client,
      userId,
      pars,
    );
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to delete wishlist item for ${userId}`);
  }
}

export async function feedbackCreateAuth(userId: string, pars: FeedbackCreatePars) {
  try {
    const result = await feedbackCreate(
      ddbDocClient,
      process.env.FEEDBACK_TABLE,
      s3Client,
      userId,
      pars,
    );
    if (!result.ok) {
      const body: Record<string, unknown> = { message: result.message };
      if (result.existingId) {
        body.existingId = result.existingId;
      }
      if (result.code) {
        body.code = result.code;
      }
      return {
        statusCode: result.statusCode ?? 400,
        body: JSON.stringify(body),
        headers,
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to create feedback for ${userId}`);
  }
}

export async function feedbackVoteAuth(userId: string, pars: FeedbackVotePars) {
  try {
    const result = await feedbackVote(ddbDocClient, process.env.FEEDBACK_TABLE, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to vote on feedback for ${userId}`);
  }
}

export async function feedbackCommentAuth(userId: string, pars: FeedbackCommentPars) {
  try {
    const result = await feedbackComment(ddbDocClient, process.env.FEEDBACK_TABLE, s3Client, userId, pars);
    if (!result.ok) {
      return feedbackErrorResponse(result.message, result.statusCode ?? 400);
    }
    return {
      statusCode: 200,
      body: JSON.stringify(result.data),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return feedbackErrorResponse(`Unable to comment on feedback for ${userId}`);
  }
}
