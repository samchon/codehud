import type {
  ICodeHudContext,
  ICodeHudFrame,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";
import { CodeHudText } from "@codehud/projection";

/**
 * Which of several sessions the wearer is looking at, and how they choose.
 *
 * A namespace: two pure functions of what they are handed. They are separate
 * from the host that owns the sessions because both are product decisions — one
 * about whose content wins the display, one about how a session is named to
 * somebody who must not pronounce a path — and a decision inside a class that
 * also owns a socket is one no test can reach.
 *
 * @evidence requirements/notification/attention-and-quiet.md#notification-names-session Names a session by the trailing segments of its directory and selects it by ordinal, so a wearer running several agents can tell them apart without pronouncing one.
 * @evidence specifications/notification/attention-contract.md#spec-notification-demand-precedence Implements the precedence rule: a demand from any session takes the display, and the focus stays where the wearer put it.
 * @evidence specifications/voice-surface/utterance-routing.md#spec-voice-no-identifier-dictation Implements selection by ordinal against a stated list, which is the alternative the specification requires where an exact string would otherwise be needed.
 * @author Samchon
 */
export namespace CodeHudDeskFocus {
  /**
   * Which session's frame belongs on the display.
   *
   * The one in focus, unless another is demanding. An approval blocks its own
   * session whether or not the wearer is watching that one, and a wearer cannot
   * choose to look at a session they do not know is waiting; the frame names its
   * own directory, so taking the display is safe without taking the focus.
   *
   * Searched in the order the sessions were opened, so which one wins does not
   * depend on which happened to speak last. Notices and ambient frames from
   * elsewhere do not take the display: missing one costs the wearer nothing,
   * and the session they chose is the one they keep.
   */
  export const showing = (
    sessions: readonly ISession[],
    focus: number,
  ): ISession | undefined =>
    sessions.find((session) => session.urgency === "demand") ??
    sessions[focus] ??
    sessions[0];

  /**
   * What the wearer hears when they ask what is running.
   *
   * Numbered from one, because that is the number they will say back. Named by
   * the trailing segments of the directory, because the tail is what tells two
   * checkouts apart and the head is a home directory they already know. The one
   * on the display is marked, since a list that did not say where they are
   * makes them move to find out.
   */
  export const listing = (
    sessions: readonly ISession[],
    focus: number,
    geometry: ICodeHudGlassesDescriptor.IGeometry,
    words: ICodeHudContext.IVocabulary,
  ): string[] =>
    sessions.length === 0
      ? [words.nosuch]
      : [
          words.listing,
          ...sessions.map((session, index) => {
            const name: string = CodeHudText.path(
              session.directory,
              geometry.columns,
            );
            const mark: string = index === focus ? ` (${words.showing})` : "";
            return `${index + 1}. ${name}${mark}`;
          }),
        ];

  /**
   * Whether an ordinal names a session, counting the way it was read out.
   *
   * A number naming nothing is the shape a misheard ordinal takes, and it is
   * answered rather than ignored: a wearer moved nowhere silently cannot tell
   * that from not having been heard.
   */
  export const selected = (
    sessions: readonly ISession[],
    ordinal: number,
  ): number | undefined => {
    const index: number = ordinal - 1;
    return index >= 0 && index < sessions.length ? index : undefined;
  };

  /** One session, as the display and the wearer's selection need it. */
  export interface ISession {
    /** Identifier the bridge addresses it by. */
    id: string;

    /** Where its agent works, which is how a wearer tells it from the rest. */
    directory: string;

    /** How hard its current frame is competing for attention. */
    urgency: ICodeHudFrame.Urgency;
  }
}
