import type { Command } from "commander";
import { bootstrap } from "../core/bootstrap.js";
import { confirm } from "../core/confirm.js";
import { printResult } from "../core/output.js";
import type { Capability } from "../providers/index.js";

interface ActionOptions {
  yes?: boolean;
}

/** A command that takes one id, may ask first, changes one thing and prints the result. */
export interface IdActionSpec<Ctx, Out> {
  /** E.g. "close <plan>". */
  usage: string;
  description: string;
  parseId: (raw: string) => number;
  /** The optional provider feature the command uses, e.g. "milestones". */
  needs?: Capability;
  /** Ask in a terminal unless `--yes`; without one, CONFIRM_REQUIRED. Leave out for actions that never ask. */
  confirm?: {
    /** Help text for `-y, --yes`. */
    yesHelp: string;
    question: (id: number, ctx: Ctx) => string | Promise<string>;
  };
  /** Runs after bootstrap, with or without `--yes`: build services, start lookups. */
  prepare: (id: number) => Ctx | Promise<Ctx>;
  act: (id: number, ctx: Ctx) => Promise<Out>;
  render: (out: Out) => string;
}

export function registerIdAction<Ctx, Out>(group: Command, spec: IdActionSpec<Ctx, Out>): void {
  const command = group.command(spec.usage).description(spec.description);
  if (spec.confirm) command.option("-y, --yes", spec.confirm.yesHelp);
  command.action(async (rawId: string, opts: ActionOptions, cmd: Command) => {
    const id = spec.parseId(rawId);
    const { mode } = bootstrap(cmd, spec.needs);
    const ctx = await spec.prepare(id);
    if (spec.confirm && !opts.yes) await confirm(await spec.confirm.question(id, ctx));
    const out = await spec.act(id, ctx);
    printResult(mode, out, () => spec.render(out));
  });
}

interface Removable<Found> {
  get: (id: number) => Promise<Found>;
  remove: (id: number) => Promise<unknown>;
}

/** A delete command: fetch, confirm unless `--yes`, delete, print `{ id, <label>, deleted: true }`. */
export interface DeleteSpec<Key extends string, Found extends Record<Key, string>> {
  usage: string;
  description: string;
  parseId: (raw: string) => number;
  needs?: Capability;
  /** Built after bootstrap. */
  service: () => Removable<Found>;
  /** The field that names the item in the output: "name", or "title" for cases. */
  key: Key;
  /** How the item is written in the output, e.g. "M3" or "section 3". */
  ref: (id: number) => string;
  question: (id: number, found: Found) => string;
}

export function registerDeleteAction<Key extends string, Found extends Record<Key, string>>(
  group: Command,
  spec: DeleteSpec<Key, Found>,
): void {
  type Deleted = { id: number; deleted: true } & Record<Key, string>;
  registerIdAction<{ service: Removable<Found>; found: Found }, Deleted>(group, {
    usage: spec.usage,
    description: spec.description,
    parseId: spec.parseId,
    ...(spec.needs ? { needs: spec.needs } : {}),
    confirm: { yesHelp: "Delete without asking", question: (id, ctx) => spec.question(id, ctx.found) },
    prepare: async (id) => {
      const service = spec.service();
      return { service, found: await service.get(id) };
    },
    act: async (id, { service, found }) => {
      await service.remove(id);
      // Built in this order so the JSON reads { id, name, deleted }.
      return { id, [spec.key]: found[spec.key], deleted: true } as Deleted;
    },
    render: (out) => `Deleted ${spec.ref(out.id)}  ${out[spec.key]}`,
  });
}
