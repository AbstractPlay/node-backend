import { v4 as uuid } from 'uuid';
import { ddbDocClient } from '../ddb.js';
import { headers, formatReturnError, logGetItemError } from '../api/http.js';
import {
  deletePlaygroundSave,
  getPlaygroundSave,
  listPlaygroundSaves,
  putPlaygroundSave,
  validatePlaygroundSaveInput,
  type PlaygroundSaveInput,
} from '../playgroundSaves.js';

export async function listPlaygroundSavesAuth(userId: string) {
  try {
    const saves = await listPlaygroundSaves(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
    );
    return {
      statusCode: 200,
      body: JSON.stringify(saves),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to list playground saves for ${userId}`);
  }
}

export async function getPlaygroundSaveAuth(userId: string, pars: { id: string }) {
  if (!pars?.id) {
    return formatReturnError('id is required.');
  }
  try {
    const save = await getPlaygroundSave(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      pars.id,
    );
    if (save === undefined) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Playground save not found.' }),
        headers,
      };
    }
    return {
      statusCode: 200,
      body: JSON.stringify(save),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to get playground save ${pars.id}`);
  }
}

export async function createPlaygroundSaveAuth(userId: string, pars: PlaygroundSaveInput) {
  const validated = validatePlaygroundSaveInput(pars);
  if (!validated.ok) {
    return formatReturnError(validated.message);
  }
  const id = uuid();
  try {
    const record = await putPlaygroundSave(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      id,
      validated.data,
    );
    return {
      statusCode: 200,
      body: JSON.stringify(record),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to create playground save for ${userId}: ${error}`);
  }
}

export async function savePlaygroundSaveAuth(userId: string, pars: PlaygroundSaveInput & { id: string }) {
  if (!pars?.id) {
    return formatReturnError('id is required.');
  }
  const validated = validatePlaygroundSaveInput(pars);
  if (!validated.ok) {
    return formatReturnError(validated.message);
  }
  try {
    const existing = await getPlaygroundSave(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      pars.id,
    );
    if (existing === undefined) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Playground save not found.' }),
        headers,
      };
    }
    const record = await putPlaygroundSave(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      pars.id,
      validated.data,
    );
    return {
      statusCode: 200,
      body: JSON.stringify(record),
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to save playground save ${pars.id}: ${error}`);
  }
}

export async function deletePlaygroundSaveAuth(userId: string, pars: { id: string }) {
  if (!pars?.id) {
    return formatReturnError('id is required.');
  }
  try {
    const existing = await getPlaygroundSave(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      pars.id,
    );
    if (existing === undefined) {
      return {
        statusCode: 404,
        body: JSON.stringify({ message: 'Playground save not found.' }),
        headers,
      };
    }
    await deletePlaygroundSave(
      ddbDocClient,
      process.env.ABSTRACT_PLAY_TABLE!,
      userId,
      pars.id,
    );
    return {
      statusCode: 200,
      headers,
    };
  } catch (error) {
    logGetItemError(error);
    return formatReturnError(`Unable to delete playground save ${pars.id}`);
  }
}
