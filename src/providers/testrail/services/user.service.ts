import { notFoundAs } from "../errors.js";
import { InputError } from "../../../core/errors.js";
import type { HttpClient } from "../http.js";
import { collectPages } from "../paging.js";
import { inBatches, MAX_LIST, type Collected } from "../../../core/paging.js";
import type { User } from "../types.js";
import type { Users } from "../../provider.js";

/** get_user(s) and get_user_by_email endpoints. */
export class UserService implements Users {
  constructor(private readonly http: HttpClient) {}

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

  /** Names by user id, a few get_user calls at a time; an unknown user is left out. */
  async names(ids: number[]): Promise<Map<number, string>> {
    const named = await inBatches([...new Set(ids)], (id) => this.byId(id).catch(() => undefined));
    return new Map(named.flatMap((user) => (user ? [[user.id, user.name] as const] : [])));
  }

  /** `resolve` when the flag was given, otherwise undefined. */
  resolveOptional(assignee: string | undefined, myEmail: string, flag: string): Promise<User | undefined> {
    return assignee === undefined ? Promise.resolve(undefined) : this.resolve(assignee, myEmail, flag);
  }

  /** Users with access to the project; TestRail Cloud needs the project id unless you are an admin. */
  async list(projectId: number): Promise<Collected<User>> {
    const inProject = await collectPages<User>(`get_users/${projectId}`, "users", {}, MAX_LIST, this.http);
    if (inProject.items.length > 0) return inProject;
    // On Cloud, get_users/<project> can come back empty for projects open to everyone; an admin may still list all.
    return collectPages<User>("get_users", "users", {}, MAX_LIST, this.http).catch(() => inProject);
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
