import type {
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
  ): IAction => {
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
        return command(routing.command, state);
    }
  };

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
  ): IAction => {
    switch (kind) {
      case "allow":
      case "deny": {
        const pending: ICodeHudState["pending"] = state.pending;
        if (pending === undefined) return { type: "none" };
        const option: ICodeHudAgentPermission | undefined =
          pending.options.find(
            (candidate) =>
              candidate.affirmative === (kind === "allow") &&
              candidate.persistent === false,
          );
        return option === undefined
          ? { type: "say", reason: "unoffered" }
          : {
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

  /** One effect, which is all a single utterance may have. */
  export type IAction =
    | IPrompt
    | IDecision
    | IInterrupt
    | IReview
    | IRedraw
    | IAnswer
    | ISilence
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
