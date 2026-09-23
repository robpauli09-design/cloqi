export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const authError = () =>
  new HttpError(
    401,
    "sign_in_required",
    "Bitte melde dich unter Einstellungen an.",
  );
