import { CodeHudSessionClient } from "@codehud/client";
import type {
  ICodeHudAgentEvent,
  ICodeHudBridgeProvider,
  ICodeHudClientProvider,
  ICodeHudContext,
  ICodeHudFrame,
  ICodeHudGlassesAdapter,
  ICodeHudGlassesDescriptor,
  ICodeHudNotification,
  ICodeHudVoiceRouting,
} from "@codehud/interface";
import {
  CodeHudContext,
  CodeHudNotifier,
  CodeHudVoiceRouter,
} from "@codehud/projection";
import { type Interface, createInterface } from "node:readline";
import { WebSocketConnector } from "tgrid";

import { CodeHudDeskAction } from "./CodeHudDeskAction";
import { CodeHudTerminalGlasses } from "./CodeHudTerminalGlasses";

/**
 * Runs the device half of the product on a desk.
 *
 * A class, and a facade controller: it owns a socket, a session, a readline
 * interface, and the glasses standing in for the ones that are not on anybody's
 * face. Every rule it obeys lives somewhere else — the router decides what an
 * utterance is, {@link CodeHudDeskAction} decides what that does, the client
 * folds, the composer fits, the notifier grades, the canvas draws — which is
 * why no unit test covers this file. What is left here is a connection, a
 * stream of typed lines, and a console.
 *
 * ## Why this exists
 *
 * Until it did, every one of those collaborators was reached only by the test
 * suite. The client, the router, the notifier, and the terminal device adapter
 * each had full coverage and no caller: the product was a set of parts that had
 * been proven to fit and had never been assembled. A person could not use
 * CodeHUD at all, on any hardware, because nothing ran the device side.
 *
 * This is the assembly, at the one geometry a desk can show. It is not a
 * substitute for the phone shell and claims nothing about hardware: what it
 * demonstrates is that the seams hold when something drives them for real.
 *
 * ## What it cannot show
 *
 * Both limits belong to the adapter it drives and are stated there in full: a
 * keyboard does not mishear, so the consent floor is never exercised here, and
 * there is no push-to-talk. A wearer of the real device gets both; a reader of
 * this terminal must not conclude either has been tested.
 *
 * @evidence requirements/product/charter.md#product-two-adapter-axes Runs one device adapter against one harness family without either knowing the other, which is the arrangement the axes exist to make possible.
 * @evidence specifications/device-surface/capability-and-input.md#spec-device-adapter-authority Drives an adapter that renders what it is handed and reports what it observes, keeping composition and the meaning of input outside it.
 * @author Samchon
 */
export class CodeHudDeskCommand {
  private readonly context: ICodeHudContext;
  private readonly router: CodeHudVoiceRouter;
  private readonly notifier: CodeHudNotifier = new CodeHudNotifier();
  /**
   * The device this host drives.
   *
   * Held as the contract rather than as the terminal it happens to be, so the
   * optional operations are optional here too: a host that called `speak` on a
   * concrete adapter would be asking a class rather than a device, and the one
   * class it has does not speak.
   */
  private readonly glasses: ICodeHudGlassesAdapter;
  private readonly lines: CodeHudDeskCommand.ILines =
    CodeHudDeskCommand.queue();

  private client: CodeHudSessionClient | null = null;
  private session: string = "";
  private shown: string = "";

  /** Constructs a desk host bound to one set of options. */
  public constructor(private readonly props: CodeHudDeskCommand.IProps) {
    this.context = props.context ?? CodeHudContext.DEFAULT;
    this.router = new CodeHudVoiceRouter(this.context);
    this.glasses = new CodeHudTerminalGlasses({
      geometry: props.geometry,
      lines: this.lines.inputs,
      write: (line: string) => this.props.write(line),
    });
  }

  /**
   * Connects, opens a session, and reads typed lines until the input ends.
   *
   * The session is opened here rather than waited for, because a wearer running
   * this has a repository in mind and the bridge has no way to guess which one.
   * Resolves when the wearer stops typing or the connection goes.
   */
  public async run(): Promise<void> {
    const connector = new WebSocketConnector<
      null,
      ICodeHudClientProvider,
      ICodeHudBridgeProvider
    >(null, {
      // The provider is written before the client exists, because the bridge
      // may push an observation the instant the handshake completes and a
      // provider that was not listening yet would drop it.
      event: async (event: ICodeHudAgentEvent): Promise<void> => {
        await this.client?.event(event);
        await this.draw();
      },
      liveness: async (): Promise<ICodeHudClientProvider.ILiveness> => ({
        held: true,
      }),
    });
    await connector.connect(this.props.address);

    const client: CodeHudSessionClient = new CodeHudSessionClient({
      bridge: connector.getDriver(),
      token: this.props.token,
      descriptor: this.descriptor,
      context: this.context,
    });
    this.client = client;

    try {
      await this.glasses.connect();
      await client.connect();
      this.session = await client.open({
        kind: this.props.kind,
        directory: this.props.directory,
        policy: this.props.policy,
      });
      await this.glasses.listen();
      await this.draw();
      await this.consume(client);
    } finally {
      this.lines.end();
      await connector.close().catch(() => undefined);
      await this.glasses.disconnect();
    }
  }

  /** Feeds one typed line in, as a device would feed in recognized speech. */
  public speak(line: string): void {
    this.lines.push(line);
  }

  /** Stops reading, which ends {@link run}. */
  public stop(): void {
    this.lines.end();
  }

  /** What this stand-in claims to be. */
  private get descriptor(): ICodeHudGlassesDescriptor {
    return this.glasses.descriptor;
  }

  /**
   * Reads recognized utterances and performs what each one means.
   *
   * The routing and the action are two separate decisions on purpose: what the
   * wearer said is the router's to settle, and what that does to the session is
   * {@link CodeHudDeskAction}'s. Neither is decided here.
   */
  private async consume(client: CodeHudSessionClient): Promise<void> {
    for await (const input of this.glasses.inputs) {
      if (input.type !== "speech" || input.final !== true) continue;
      const routing: ICodeHudVoiceRouting = this.router.route(input.text, {
        ...(input.confidence === undefined
          ? {}
          : { confidence: input.confidence }),
      });
      await this.perform(
        client,
        CodeHudDeskAction.decide(
          routing,
          client.state(this.session),
          this.props.policy,
        ),
      );
    }
  }

  /** Carries out one decided action, and redraws what it changed. */
  private async perform(
    client: CodeHudSessionClient,
    action: CodeHudDeskAction.IAction,
  ): Promise<void> {
    switch (action.type) {
      case "prompt":
        await client.send(this.session, {
          type: "prompt",
          text: action.text,
        });
        break;
      case "decision":
        await client.send(this.session, {
          type: "decision",
          request: action.request,
          option: action.option,
        });
        break;
      case "interrupt":
        await client.send(this.session, { type: "interrupt" });
        break;
      case "review":
        client.review(this.session, action.move);
        break;
      case "redraw":
        this.shown = "";
        break;
      case "answer":
        this.say(this.router.answer(action.query, client.state(this.session)));
        break;
      case "silence":
        this.silence(action.active);
        break;
      case "confirm":
        client.confirm(this.session, action.request, action.confirming);
        break;
      case "say":
        this.say(this.phrase(action));
        break;
      case "none":
        return;
    }
    await this.draw();
  }

  /**
   * Draws the current frame, unless the display already shows it.
   *
   * The comparison the adapter contract requires, kept here rather than in the
   * adapter because a terminal has no screen to read back: what is already
   * shown is the last thing this host wrote. Without it a streaming turn would
   * print one box per token.
   */
  private async draw(): Promise<void> {
    const client: CodeHudSessionClient | null = this.client;
    if (client === null || this.session.length === 0) return;
    const frame: ICodeHudFrame = client.frame(this.session);
    if (frame.key === this.shown) return;
    this.shown = frame.key;

    const permission: CodeHudNotifier.IPermission = this.notifier.present(
      frame,
      client.state(this.session),
    );
    // The two permissions, each obeyed through the operation that belongs to
    // it. Speaking is optional on the contract, so a device without a speaker
    // needs no test here: it does not implement the method, and the grade that
    // permitted speech is drawn and not spoken. This terminal is one.
    if (permission.wake === true) await this.glasses.wake();
    await this.glasses.render(frame);
    if (permission.speak === true)
      await this.glasses.speak?.(frame.lines[0]?.text ?? "");
    const fallback: ICodeHudNotification.IFallback | undefined =
      permission.fallback;
    if (fallback !== undefined)
      this.say(`${this.context.vocabulary.elsewhere} (${fallback.reason})`);
  }

  /**
   * Enters or leaves quiet mode, and presents what it held.
   *
   * Leaving is where the work is. What accumulated while quiet is still pending
   * on its sessions and still answerable, so presenting it is a matter of
   * saying what is waiting rather than replaying frames: the current one is
   * drawn immediately afterwards, and it is the one the wearer can act on.
   *
   * The acknowledgement is said rather than drawn, because a wearer entering
   * quiet mode is by definition about to stop looking.
   */
  private silence(active: boolean): void {
    const held: ICodeHudNotification[] = this.notifier.silence(active);
    const words: ICodeHudContext.IVocabulary = this.context.vocabulary;
    this.say(active === true ? words.muted : words.unmuted);
    for (const notification of held)
      this.say(`${notification.frame.lines[0]?.text ?? ""}`);
    // What was suppressed was suppressed before it could be drawn, so the
    // display is showing something older than the wearer now expects.
    this.shown = "";
  }

  /** Writes one line of the host's own, outside the box. */
  private say(text: string): void {
    this.props.write(text);
  }

  /** What the host says when it declines to act, in the wearer's words. */
  private phrase(action: CodeHudDeskAction.ISay): string {
    const words: ICodeHudContext.IVocabulary = this.context.vocabulary;
    switch (action.reason) {
      case "ambiguous":
        return `${words.ambiguous}: ${(action.candidates ?? []).join(", ")}`;
      case "unheard":
        return words.unheard;
      case "unoffered":
        return words.unoffered;
      case "single":
        return words.single;
      case "help":
        return this.router.help().join(", ");
    }
  }
}
export namespace CodeHudDeskCommand {
  /**
   * The policy a desk session runs under when the wearer states none.
   *
   * The partition the specification fixes, written as data because a device
   * states a policy and cannot reach the harness axis that translates one. The
   * suite pins it against the harness's own defaults, so the two spellings of
   * one decision cannot drift apart unnoticed.
   */
  export const POLICY: ICodeHudBridgeProvider.IOpen["policy"] = Object.freeze({
    actions: Object.freeze({
      read: "unattended",
      write: "attended",
      execute: "attended",
      network: "attended",
      delete: "confirmed",
      history: "confirmed",
      publish: "confirmed",
      credential: "confirmed",
    }),
  });

  /** What the host needs to run. */
  export interface IProps {
    /** Where the bridge is, as its pairing payload names it. */
    address: string;

    /** The credential that payload carried. */
    token: string;

    /** Which harness to open a session on. */
    kind: ICodeHudBridgeProvider.IOpen["kind"];

    /** Absolute directory the agent works in. */
    directory: string;

    /** What needs asking, for the session this opens. */
    policy: ICodeHudBridgeProvider.IOpen["policy"];

    /** The geometry being simulated, which frames are judged against. */
    geometry: ICodeHudGlassesDescriptor.IGeometry;

    /** Where a line goes. */
    write: (line: string) => void;

    /** Configuration the fold, the projection, and the router read. */
    context?: ICodeHudContext;
  }

  /** A stream of typed lines that can be pushed to and ended. */
  export interface ILines {
    /** What the adapter reads. */
    inputs: AsyncIterable<string>;

    /** Offers one line. */
    push: (line: string) => void;

    /** Ends the stream, which ends the run. */
    end: () => void;
  }

  /**
   * A queue that bridges callbacks into an async iterable.
   *
   * Readline hands lines to a callback and the adapter reads an iterable, and
   * something has to hold the ones that arrive while nobody is waiting. A line
   * typed during a round trip would otherwise be dropped, which on a surface
   * whose only input is speech is a wearer repeating themselves.
   */
  export const queue = (): ILines => {
    const held: string[] = [];
    let waiting: ((line: IteratorResult<string>) => void) | null = null;
    let ended: boolean = false;
    const settle = (): void => {
      if (waiting === null) return;
      const resolve = waiting;
      if (held.length !== 0) {
        waiting = null;
        resolve({ value: held.shift() as string, done: false });
      } else if (ended === true) {
        waiting = null;
        resolve({ value: undefined as unknown as string, done: true });
      }
    };
    return {
      push: (line: string): void => {
        if (ended === true) return;
        held.push(line);
        settle();
      },
      end: (): void => {
        ended = true;
        settle();
      },
      inputs: {
        [Symbol.asyncIterator]: (): AsyncIterator<string> => ({
          next: (): Promise<IteratorResult<string>> => {
            if (held.length !== 0)
              return Promise.resolve({
                value: held.shift() as string,
                done: false,
              });
            if (ended === true)
              return Promise.resolve({
                value: undefined as unknown as string,
                done: true,
              });
            return new Promise<IteratorResult<string>>((resolve) => {
              waiting = resolve;
            });
          },
        }),
      },
    };
  };

  /**
   * Reads a bridge's pairing payload into what a host needs.
   *
   * The payload is what a phone would scan, so a desk takes the same string
   * rather than a second spelling of the same three facts.
   */
  export const paired = (
    payload: string,
  ): { address: string; token: string } => {
    const url: URL = new URL(payload);
    const token: string | null = url.searchParams.get("token");
    if (token === null || token.length === 0)
      throw new Error("the pairing code carries no token");
    url.search = "";
    return { address: url.toString(), token };
  };

  /**
   * Runs a desk host from command-line arguments.
   *
   * Exists so the workspace has one command a person can type. Reads the
   * pairing payload the bridge printed, and everything else from flags with
   * defaults a desk can live with.
   */
  export const main = async (argv: string[]): Promise<void> => {
    const flag = (name: string): string | undefined => {
      const index: number = argv.indexOf(`--${name}`);
      return index === -1 ? undefined : argv[index + 1];
    };
    const payload: string | undefined = argv.find((value) =>
      value.startsWith("ws://"),
    );
    if (payload === undefined)
      throw new Error(
        "pass the pairing address the bridge printed, such as" +
          " ws://127.0.0.1:37219/?token=…",
      );

    const { address, token } = paired(payload);
    const command: CodeHudDeskCommand = new CodeHudDeskCommand({
      address,
      token,
      kind: (flag("kind") ??
        "claude-code") as ICodeHudBridgeProvider.IOpen["kind"],
      directory: flag("cd") ?? process.cwd(),
      policy: POLICY,
      geometry: {
        columns: Number.parseInt(flag("columns") ?? "40", 10),
        rows: Number.parseInt(flag("rows") ?? "3", 10),
        colored: false,
      },
      write: (line: string) => {
        console.log(line);
      },
    });

    const reader: Interface = createInterface({ input: process.stdin });
    reader.on("line", (line: string) => command.speak(line));
    reader.on("close", () => command.stop());
    try {
      await command.run();
    } finally {
      reader.close();
    }
  };
}
