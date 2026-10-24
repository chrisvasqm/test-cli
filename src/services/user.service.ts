import { HttpClient } from "../core/http.js";
import type { User } from "../core/testrail-types.js";

/** get_user_by_email endpoint. */
export class UserService {
  constructor(private readonly http = HttpClient.get()) {}

  byEmail(email: string): Promise<User> {
    return this.http.get<User>("get_user_by_email", { email });
  }
}
