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
import { type Driver, WebSocketConnector } from "tgrid";

import { CodeHudDeskAction } from "./CodeHudDeskAction";
import { CodeHudDeskFocus } from "./CodeHudDeskFocus";
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
 * Two limits belong to the adapter it drives and are stated there in full: a
 * keyboard does not mishear, so the consent floor is never exercised here, and
 * there is no push-to-talk. A wearer of the real device gets both; a reader of
 * this terminal must not conclude either has been tested.
 *
 * A third belongs here. This host does not reconnect: a dropped socket ends the
 * run rather than reattaching from the counter its fold reached. The client can
 * do it — reattaching from a remembered counter is what it was built around —
 * and the phone shell will, because a wearer walks out of range and back. A
 * desk does not, so nothing here exercises that path and nobody should read
 * this as having tested it.
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

  /**
   * The sessions this host opened, in the order it opened them.
   *
   * The order is the wearer's selection vocabulary: they say a number, not a
   * path, because no contract may require a wearer to pronounce an identifier.
   */
  private readonly sessions: { id: string; directory: string }[] = [];

  /**
   * Which session the display is showing.
   *
   * An index rather than an identifier, so the number a wearer says and the
   * thing it selects are the same fact. Moved only by the wearer: an approval
   * in another session takes the display without taking the focus, because a
   * focus that reassigned itself is one the wearer has to re-establish rather
   * than one they set.
   */
  private focus: number = 0;
  private shown: string = "";

  /**
   * The connection of the moment, or none while there is not one.
   *
   * Replaced wholesale on a reconnection rather than reopened, because a
   * connector that has closed does not open again.
   */
  private driver: WebSocketConnector<
    null,
    ICodeHudClientProvider,
    ICodeHudBridgeProvider
  > | null = null;

  /**
   * Whether this host is shutting down.
   *
   * A closing connection ends the same way a dropped one does, and without this
   * the teardown would reconnect to the bridge it was in the middle of leaving.
   */
  private closing: boolean = false;

  /** Whether a reconnection is already in flight, so two do not race. */
  private recovering: boolean = false;

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
   * Connects, opens a session per named directory, and reads typed lines until
   * the input ends.
   *
   * The sessions are opened here rather than waited for, because a wearer
   * running this has repositories in mind and the bridge has no way to guess
   * which. They are opened in the order they were named, and that order is the
   * one the wearer selects by.
   *
   * A dropped connection is not the end of the run. The wearer walks out of
   * range and back, and the sessions belong to the bridge rather than to the
   * socket, so this reconnects and reattaches each session from the counter its
   * own fold reached — which is the whole reason the client remembers one.
   * Resolves when the wearer stops typing, or when the bridge has stopped
   * answering for long enough that reconnecting is no longer plausible.
   */
  public async run(): Promise<void> {
    const client: CodeHudSessionClient = new CodeHudSessionClient({
      // A stable stand-in for whichever connection is current. The client is
      // built to talk to the bridge as an interface rather than as a transport,
      // and this is what lets a reconnection be invisible to it: the folds and
      // the counters it holds are exactly what must survive one.
      bridge: this.bridge(),
      token: this.props.token,
      descriptor: this.descriptor,
      context: this.context,
    });
    this.client = client;

    try {
      await this.glasses.connect();
      await this.dial();
      await client.connect();
      for (const directory of this.props.directories) {
        const id: string = await client.open({
          kind: this.props.kind,
          directory,
          policy: this.props.policy,
        });
        this.sessions.push({ id, directory });
      }
      await this.glasses.listen();
      await this.draw();
      await this.consume(client);
    } finally {
      this.closing = true;
      this.lines.end();
      await this.driver?.close().catch(() => undefined);
      await this.glasses.disconnect();
    }
  }

  /**
   * Opens a connection and remembers it, replacing whatever was there.
   *
   * Every call is a fresh socket. The client is untouched: it holds the folds
   * and the counters, and it reaches whatever this leaves behind.
   */
  private async dial(): Promise<void> {
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
    this.driver = connector;
    // The connection ending is the signal to reconnect. It ends for two
    // reasons and only one of them is a reason to come back.
    void connector.join().then(async (): Promise<void> => {
      if (this.closing === true || this.recovering === true) return;
      this.say(this.context.vocabulary.dropped);
      this.recovering = true;
      await this.recover();
      this.recovering = false;
    });
  }

  /**
   * Reconnects and reattaches, or reports that it could not.
   *
   * Reattachment is `connect()` on the client: it says hello again and attaches
   * every session the bridge still advertises, each from the counter that
   * session's fold reached. Nothing is replayed that was already folded, and
   * nothing that arrived while the socket was gone is missed — that convergence
   * is the property the whole counter exists for.
   *
   * Bounded. A wearer out of range comes back; a bridge that has stopped does
   * not, and a host retrying a dead machine forever is a display that lies
   * about being connected.
   */
  private async recover(): Promise<boolean> {
    for (
      let attempt: number = 0;
      attempt < CodeHudDeskCommand.ATTEMPTS;
      ++attempt
    ) {
      await CodeHudDeskCommand.pause(CodeHudDeskCommand.PAUSE);
      const reached: boolean = await this.dial()
        .then(() => true)
        .catch(() => false);
      if (reached === false) continue;
      const welcomed: boolean = await (this.client as CodeHudSessionClient)
        .connect()
        .then(() => true)
        .catch(() => false);
      if (welcomed === true) {
        this.shown = "";
        await this.draw();
        return true;
      }
    }
    this.say(this.context.vocabulary.unreachable);
    return false;
  }

  /**
   * The bridge as the client sees it: one object, whichever socket is current.
   *
   * Every call is forwarded to the connection of the moment. A call made while
   * there is none is an error the caller sees, which is the truth: an
   * instruction cannot be delivered to a bridge this host cannot reach.
   */
  private bridge(): ICodeHudBridgeProvider {
    const driver = (): Driver<ICodeHudBridgeProvider> => {
      const held = this.driver;
      if (held === null) throw new Error("the bridge is not connected");
      return held.getDriver();
    };
    return {
      hello: (props) => driver().hello(props),
      probe: () => driver().probe(),
      open: (props) => driver().open(props),
      attach: (session, from) => driver().attach(session, from),
      send: (session, command) => driver().send(session, command),
      close: (session) => driver().close(session),
    };
  }

  /** Feeds one typed line in, as a device would feed in recognized speech. */
  public speak(line: string): void {
    this.lines.push(line);
  }

  /** Stops reading, which ends {@link run}. */
  public stop(): void {
    this.closing = true;
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
          client.state(this.current),
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
        await client.send(this.current, {
          type: "prompt",
          text: action.text,
        });
        break;
      case "decision":
        await client.send(this.current, {
          type: "decision",
          request: action.request,
          option: action.option,
        });
        break;
      case "interrupt":
        await client.send(this.current, { type: "interrupt" });
        break;
      case "review":
        client.review(this.current, action.move);
        break;
      case "redraw":
        this.shown = "";
        break;
      case "answer":
        this.say(this.router.answer(action.query, client.state(this.current)));
        break;
      case "silence":
        this.silence(action.active);
        break;
      case "confirm":
        client.confirm(this.current, action.request, action.confirming);
        break;
      case "list":
        for (const line of this.listing()) this.say(line);
        break;
      case "focus":
        this.moved(action.ordinal);
        break;
      case "say":
        this.say(this.phrase(action));
        break;
      case "none":
        return;
    }
    await this.draw();
  }

  /** The session every instruction is addressed to, which is the one shown. */
  private get current(): string {
    return this.sessions[this.focus]?.id ?? "";
  }

  /** States what there is to select from, and which one is on the display. */
  private listing(): string[] {
    return CodeHudDeskFocus.listing(
      this.described(),
      this.focus,
      this.props.geometry,
      this.context.vocabulary,
    );
  }

  /**
   * Shows a different session, or says that the number named none.
   *
   * The display is about to be another session's, so the comparison that skips
   * an unchanged frame must not skip this one.
   */
  private moved(ordinal: number): void {
    const index: number | undefined = CodeHudDeskFocus.selected(
      this.described(),
      ordinal,
    );
    if (index === undefined) {
      this.say(this.context.vocabulary.nosuch);
      return;
    }
    this.focus = index;
    this.shown = "";
  }

  /**
   * The sessions with what each one is currently showing.
   *
   * The grade comes from the composed frame rather than from the fold, because
   * which content demands attention is the projection boundary's decision and
   * not this host's.
   */
  private described(): CodeHudDeskFocus.ISession[] {
    const client: CodeHudSessionClient | null = this.client;
    return this.sessions.map((session) => ({
      ...session,
      urgency:
        client === null
          ? ("ambient" as const)
          : client.frame(session.id).urgency,
    }));
  }

  /**
   * Draws whatever the wearer should be looking at, unless it is already shown.
   *
   * The session in focus, except that a demand from any session takes the
   * display: an approval blocks its own session whether or not the wearer is
   * watching that one, and a wearer cannot choose to look at a session they do
   * not know is waiting. The frame names its own directory, which is why this
   * is safe to do without moving the focus — and the focus is not moved,
   * because a focus that reassigned itself is one the wearer has to
   * re-establish rather than one they set.
   *
   * The comparison that skips an unchanged frame is kept here as well as in the
   * adapter, because this is where the decision not to present one belongs: a
   * repeated demand under quiet mode would otherwise be deferred twice.
   */
  private async draw(): Promise<void> {
    const client: CodeHudSessionClient | null = this.client;
    if (client === null || this.sessions.length === 0) return;
    const chosen: CodeHudDeskFocus.ISession | undefined =
      CodeHudDeskFocus.showing(this.described(), this.focus);
    if (chosen === undefined) return;
    const showing: string = chosen.id;
    const frame: ICodeHudFrame = client.frame(showing);
    if (frame.key === this.shown) return;
    this.shown = frame.key;

    const permission: CodeHudNotifier.IPermission = this.notifier.present(
      frame,
      client.state(showing),
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
      case "nosuch":
        return words.nosuch;
      case "help":
        return this.router.help().join(", ");
    }
  }
}
export namespace CodeHudDeskCommand {
  /**
   * How many times a dropped connection is retried before giving up.
   *
   * Bounded because a wearer out of range comes back and a stopped bridge does
   * not, and a host that retried forever would be a display quietly claiming to
   * be connected to something that is gone.
   */
  export const ATTEMPTS: number = 5;

  /** How long to wait between those attempts, in milliseconds. */
  export const PAUSE: number = 1_000;

  /** Waits, for the one place that has to. */
  export const pause = (ms: number): Promise<undefined> =>
    new Promise<undefined>((resolve) => {
      setTimeout(() => resolve(undefined), ms);
    });

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

    /**
     * Absolute directories to open a session in, one each.
     *
     * Several because a wearer runs several agents across several repositories
     * at once, which is the case the whole session-naming rule exists for. The
     * order is what the wearer selects by.
     */
    directories: string[];

    /** What needs asking, for the session this opens. */
    policy: ICodeHudBridgeProvider.IOpen["policy"];

    /** The geometry being simulated, which frames are judged against. */
    geometry: ICodeHudGlassesDescriptor.IGeometry;

    /** Where a line goes. */
    write: (line: string) => void;

    /** Configuration the fold, the projection, and the router read. */
    context?: ICodeHudContext;
  }

  /**
   * The directories named on a command line.
   *
   * Every `--cd` in order, and the working directory when none was named. The
   * order is the wearer's selection vocabulary, so it is the order they were
   * typed rather than anything sorted.
   */
  export const directories = (argv: string[]): string[] => {
    const found: string[] = [];
    for (let i: number = 0; i < argv.length; ++i)
      if (argv[i] === "--cd" && argv[i + 1] !== undefined)
        found.push(argv[i + 1] as string);
    return found.length === 0 ? [process.cwd()] : found;
  };

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
      directories: directories(argv),
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
