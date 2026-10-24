import type { Command } from "commander";
import { bootstrap } from "../../core/bootstrap.js";
import { printResult, renderList } from "../../core/output.js";
import { UserService } from "../../services/user.service.js";

export function registerList(user: Command): void {
  user
    .command("list")
    .description("List the users with access to the project; * marks you")
    .action(async (_opts: unknown, cmd: Command) => {
      const { config, mode } = bootstrap(cmd);
      const { items, hasMore } = await new UserService().list(config.projectId);
      const me = config.email.toLowerCase();
      const users = items.map((item) => ({
        id: item.id,
        name: item.name,
        email: item.email,
        active: item.is_active,
        me: item.email.toLowerCase() === me,
      }));
      printResult(mode, { users, hasMore }, () =>
        renderList(
          users.map((item) => [
            item.me ? "*" : " ",
            String(item.id),
            item.name,
            item.email,
            item.active ? "" : "inactive",
          ]),
          "No users.",
          hasMore,
        ),
      );
    });
}
