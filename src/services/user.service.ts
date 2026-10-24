import { InputError, notFoundAs } from "../core/errors.js";
import { HttpClient } from "../core/http.js";
import { collectPages, type Collected } from "../core/paging.js";
import type { User } from "../core/testrail-types.js";

/** Most users one list shows. */
const MAX_USERS = 1000;

/** get_user(s) and get_user_by_email endpoints. */
export class UserService {
  constructor(private readonly http = HttpClient.get()) {}

  byEmail(email: string): Promise<User> {
    // TestRail: 400 "Field :email is not a valid email address." for an unknown email.
    return this.http
      .get<User>("get_user_by_email", { email })
      .catch(notFoundAs("email", "USER_NOT_FOUND", `No TestRail user has the email ${email}.`));
  }

  byId(id: number): Promise<User> {
    return this.http
      .get<User>(`get_user/${id}`)
      .catch(notFoundAs("user_id", "USER_NOT_FOUND", `User ${id} does not exist or you cannot see it.`));
  }

  /** Users with access to the project; TestRail Cloud needs the project id unless you are an admin. */
  async list(projectId: number): Promise<Collected<User>> {
    const inProject = await collectPages<User>(`get_users/${projectId}`, "users", {}, MAX_USERS, this.http);
    if (inProject.items.length > 0) return inProject;
    // On Cloud, get_users/<project> can come back empty for projects open to everyone; an admin may still list all.
    return collectPages<User>("get_users", "users", {}, MAX_USERS, this.http).catch(() => inProject);
  }

  /**
   * An assignee as typed: `me` (the configured `myEmail`), an email, or a numeric user id.
   * Unknown users are USER_NOT_FOUND; anything else is a usage error naming `flag`.
   */
  async resolve(assignee: string, myEmail: string, flag: string): Promise<User> {
    const raw = assignee.trim();
    if (raw.toLowerCase() === "me") return this.byEmail(myEmail);
    if (raw.includes("@")) return this.byEmail(raw);
    const id = /^\d+$/.test(raw) ? Number(raw) : Number.NaN;
    if (!Number.isSafeInteger(id) || id < 1) {
      throw new InputError("USAGE", `${flag} takes me, an email or a user id, not "${assignee}"`);
    }
    return this.byId(id);
  }
}
