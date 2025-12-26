'use strict';

interface WebSocketConnectEvent {
  requestContext: {
    connectionId: string;
    authorizer?: {
      userId?: string;
      email?: string;
      [key: string]: any;
    };
  };
}

export const handler = async (event: WebSocketConnectEvent) => {
//   console.log("Connect event:", event);
  return { statusCode: 200 };
};
