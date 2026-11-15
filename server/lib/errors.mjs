/* A tiny HTTP error type so handlers can `throw badRequest(...)` and the
   central dispatcher turns it into a JSON response with the right status. */
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
  }
}

export const badRequest = (m) => new HttpError(400, m);
export const forbidden = (m) => new HttpError(403, m);
export const notFound = (m) => new HttpError(404, m);
export const unauthorized = (m) => new HttpError(401, m);
