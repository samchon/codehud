import type {
  ICodeHudAgentAdapter,
  ICodeHudAgentPermission,
  ICodeHudState,
  ICodeHudVoiceRouting,
} from "@codehud/interface";

/**
 * What a routed utterance does to the session in front of the wearer.
 *
 * A namespace: one pure function of a routing and a fold, with no
 * configuration, no collaborator, and no connection. It is separate from the
 * host that executes the result because this is where the product decisions
 * are, and a decision buried in a command that also owns a socket is one no
 * test can reach.
 *
 * The decisions are these. An approval answer names an *option the harness
 * actually offered*, chosen by its declared affirmative property rather than by
 * its label, because the two harnesses spell their answers differently and the
 * wearer said neither spelling. An answer with nothing pending does nothing
 * rather than being carried to the agent as prose, since a wearer who said
 * *allow* into a session that is not asking has not written a prompt. And an
 * utterance nobody heard clearly enough is reported rather than resolved, which
 * is the one case where doing nothing is the whole feature.
 *
 * @evidence requirements/voice-interaction/spoken-control.md#voice-command-versus-prompt Turns a decided routing into exactly one effect, so a wearer's words reach the client or the agent but never both.
 * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-deterministic-routing Maps each routing outcome to one action without reinterpreting the utterance, so the rule that decided it is the only rule that decides anything.
 * @author Samchon
 */
export namespace CodeHudDeskAction {
  /**
   * Decides what one routed utterance does.
   *
   * Takes the fold rather than the client, so the same routing against the same
   * state always yields the same action and the decision can be read.
   */
  export const decide = (
    routing: ICodeHudVoiceRouting,
    state: ICodeHudState,
    policy: ICodeHudAgentAdapter.IPolicy = { actions: {} },
  ): IAction => {
    // A request waiting on its second answer takes exactly one word, and every
    // other word leaves that state rather than sitting in it. Repeating the
    // affirmative is the case this exists for: one misrecognition must not
    // satisfy both asks, so the repeat does not confirm, and it does not keep
    // the request waiting to be confirmed either.
    if (state.confirming === true && state.pending !== undefined) {
      const request: string = state.pending.request;
      if (routing.type === "command" && routing.command === "confirm") {
        const option: ICodeHudAgentPermission | undefined = offered(
          state.pending,
          true,
        );
        return option === undefined
          ? { type: "say", reason: "unoffered" }
          : { type: "decision", request, option: option.id };
      }
      // Refusing and stopping are not swallowed. Both are the wearer taking
      // something back, and a state that made them say it twice would be a
      // confirmation prompt standing between a wearer and their own brake.
      // Everything else leaves the state rather than acting from inside it.
      if (
        routing.type === "command" &&
        (routing.command === "deny" || routing.command === "stop")
      )
        return command(routing.command, state, policy);
      if (routing.type === "unheard")
        return {
          type: "say",
          reason: "unheard",
          ...(routing.confidence === undefined
            ? {}
            : { confidence: routing.confidence }),
        };
      return { type: "confirm", request, confirming: false };
    }

    switch (routing.type) {
      case "prompt":
        return routing.text.length === 0
          ? { type: "none" }
          : { type: "prompt", text: routing.text };

      case "query":
        return { type: "answer", query: routing.query };

      case "ambiguous":
        return {
          type: "say",
          reason: "ambiguous",
          candidates: routing.candidates,
        };

      case "unheard":
        return {
          type: "say",
          reason: "unheard",
          ...(routing.confidence === undefined
            ? {}
            : { confidence: routing.confidence }),
        };

      case "command":
        return command(routing.command, state, policy);
    }
  };

  /**
   * The answer of one kind a request offered, if it offered one.
   *
   * By the option's declared properties, never by its label: the harness
   * families spell their answers differently and a wearer says neither
   * spelling. A persisting option is never returned, because a consent whose
   * scope a display cannot state must not be what a single word selects.
   */
  const offered = (
    pending: NonNullable<ICodeHudState["pending"]>,
    affirmative: boolean,
  ): ICodeHudAgentPermission | undefined =>
    pending.options.find(
      (candidate) =>
        candidate.affirmative === affirmative && candidate.persistent === false,
    );

  /**
   * What one command does, which depends on what the session is doing.
   *
   * `allow` and `deny` are the only two that do: both need a pending request to
   * answer, and the option they name comes from that request rather than from
   * anything stated here.
   */
  const command = (
    kind: ICodeHudVoiceRouting.ICommand.Kind,
    state: ICodeHudState,
    policy: ICodeHudAgentAdapter.IPolicy,
  ): IAction => {
    switch (kind) {
      // Nothing outside a confirming request: the word answers the second ask
      // and there is no first ask it can stand in for.
      case "confirm":
        return { type: "none" };

      case "allow":
      case "deny": {
        const pending: ICodeHudState["pending"] = state.pending;
        if (pending === undefined) return { type: "none" };
        const option: ICodeHudAgentPermission | undefined = offered(
          pending,
          kind === "allow",
        );
        if (option === undefined) return { type: "say", reason: "unoffered" };
        // The affirmative answers a doubly-confirmed request by asking again
        // rather than by answering. The class comes from the adapter that read
        // the request and the treatment from the policy the wearer stated when
        // the work began; a request whose class the adapter could not tell is
        // treated as the class the policy is most cautious about among those it
        // still lets through, which is what asking twice costs nothing to be.
        if (kind === "allow" && doubled(pending, policy) === true)
          return {
            type: "confirm",
            request: pending.request,
            confirming: true,
          };
        return {
          type: "decision",
          request: pending.request,
          option: option.id,
        };
      }

      case "stop":
        return { type: "interrupt" };

      case "back":
        return { type: "review", move: "back" };
      case "forward":
        return { type: "review", move: "forward" };
      case "latest":
        return { type: "review", move: "latest" };

      case "repeat":
        return { type: "redraw" };

      case "mute":
        return { type: "silence", active: true };
      case "unmute":
        return { type: "silence", active: false };

      case "help":
        return { type: "say", reason: "help" };

      // Both name a session other than the one in hand, and this host runs one
      // session. Reported rather than silently ignored, because a wearer whose
      // words did nothing cannot tell that from the recognizer having missed
      // them.
      case "sessions":
      case "switch":
        return { type: "say", reason: "single" };
    }
  };

  /**
   * Whether a pending request needs a second, differently worded answer.
   *
   * Read from the class the adapter reported and the treatment the wearer's
   * policy gives it. A request carrying no class is doubly-confirmed when
   * anything in the policy is, which is the cautious reading: the adapter said
   * it could not tell, and the wearer said at least one kind of thing here must
   * be asked about twice.
   */
  export const doubled = (
    pending: NonNullable<ICodeHudState["pending"]>,
    policy: ICodeHudAgentAdapter.IPolicy,
  ): boolean =>
    pending.action === undefined
      ? Object.values(policy.actions).includes("confirmed")
      : policy.actions[pending.action] === "confirmed";

  /** One effect, which is all a single utterance may have. */
  export type IAction =
    | IPrompt
    | IDecision
    | IInterrupt
    | IReview
    | IRedraw
    | IAnswer
    | ISilence
    | IConfirm
    | ISay
    | INone;

  /** Carry the words to the agent, unchanged. */
  export interface IPrompt {
    /** Discriminator. */
    type: "prompt";

    /** What the wearer said. */
    text: string;
  }

  /** Answer the request in front of the wearer. */
  export interface IDecision {
    /** Discriminator. */
    type: "decision";

    /** The request being answered, as the harness numbered it. */
    request: string;

    /** The option the harness offered, by its own identifier. */
    option: string;
  }

  /** Stop the turn in flight. */
  export interface IInterrupt {
    /** Discriminator. */
    type: "interrupt";
  }

  /** Move the review cursor, locally. */
  export interface IReview {
    /** Discriminator. */
    type: "review";

    /** Which way. */
    move: "back" | "forward" | "latest";
  }

  /** Draw the current frame again, for a wearer who looked away. */
  export interface IRedraw {
    /** Discriminator. */
    type: "redraw";
  }

  /**
   * Enter or leave quiet mode.
   *
   * Carries the state to be in rather than a toggle, because the utterance that
   * produced it named one: a wearer who says the word for silence twice has
   * asked for silence twice, and must not get the opposite of what they said.
   */
  export interface ISilence {
    /** Discriminator. */
    type: "silence";

    /** Whether waking and speech are to be suppressed. */
    active: boolean;
  }

  /**
   * Move a request into or out of waiting for its second answer.
   *
   * Local until the second word is given: the harness has not been answered,
   * the request is still pending, and it is still refusable in one word.
   */
  export interface IConfirm {
    /** Discriminator. */
    type: "confirm";

    /** The request whose second answer is or is no longer awaited. */
    request: string;

    /** Whether it is now waiting for that answer. */
    confirming: boolean;
  }

  /** Answer a question from the fold this device already holds. */
  export interface IAnswer {
    /** Discriminator. */
    type: "answer";

    /** Which question. */
    query: ICodeHudVoiceRouting.IQuery.Kind;
  }

  /** Tell the wearer something about their own utterance. */
  export interface ISay {
    /** Discriminator. */
    type: "say";

    /** Why the host is speaking rather than acting. */
    reason: ISay.Reason;

    /** The commands an ambiguous utterance matched. */
    candidates?: ICodeHudVoiceRouting.ICommand.Kind[];

    /** What the recognizer reported, when it reported anything. */
    confidence?: number;
  }
  export namespace ISay {
    /**
     * Why an utterance produced words rather than an effect.
     *
     * Every one of these is a case where acting would be guessing. Saying so is
     * what keeps a wearer from repeating themselves into a session that heard
     * them perfectly well and declined.
     */
    export type Reason =
      "ambiguous" | "unheard" | "unoffered" | "help" | "single";
  }

  /** The utterance was addressed to nothing. */
  export interface INone {
    /** Discriminator. */
    type: "none";
  }
}
