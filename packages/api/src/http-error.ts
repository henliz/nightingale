// small typed error so routes can throw instead of juggling status codes everywhere
export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
