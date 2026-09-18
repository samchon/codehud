import type { ICodeHudGlassesDescriptor } from "@codehud/interface";
import { CodeHudContext } from "@codehud/projection";
import { CodeHudDeskFocus } from "@codehud/simulator";

import { Assert } from "../internal/assert";

/**
 * Several agents, one display, and a wearer who must never pronounce a path.
 *
 * A wearer runs agents across several repositories at once — it is the case the
 * whole session-naming rule exists for, and until now nothing in the product
 * had more than one session to name. Two decisions follow from having several,
 * and both are here rather than inside the host that owns the sockets.
 *
 * **Whose content wins.** The session in focus, except that a demand from any
 * session takes the display. An approval blocks its own session whether or not
 * the wearer is watching that one, and a wearer cannot choose to look at a
 * session they do not know is waiting. Every demand-grade frame states its own
 * directory, which is what makes taking the display safe without taking the
 * focus — and the focus is not taken, because a focus that reassigned itself is
 * one the wearer has to re-establish rather than one they set.
 *
 * **How one is chosen.** By ordinal against a stated list, never by saying a
 * path: `#spec-voice-no-identifier-dictation` forbids requiring an exact string,
 * and a number is the one identifier a wearer can produce and a recognizer can
 * carry. A number naming nothing is answered rather than ignored, because that
 * is the shape a misheard ordinal takes.
 *
 * Scenarios:
 *
 * 1. With nothing demanding, the session in focus is shown.
 * 2. A demand anywhere takes the display, including from a session the wearer
 *    is not looking at.
 * 3. The first demand in opening order wins, so which one it is does not depend
 *    on which spoke last.
 * 4. A notice elsewhere does not take the display, the negative twin that keeps
 *    the rule from being "anything louder wins".
 * 5. The listing numbers from one, names by trailing path segments, and marks
 *    the one being shown.
 * 6. An empty list says so rather than reading out nothing.
 * 7. An ordinal selects by the number the wearer heard; zero, a negative, and
 *    one past the end select nothing.
 */
export async function test_device_desk_focus(): Promise<void> {
  const geometry: ICodeHudGlassesDescriptor.IGeometry = {
    columns: 40,
    rows: 3,
    colored: false,
  };
  const words = CodeHudContext.DEFAULT.vocabulary;
  const sessions = (
    ...urgencies: ("ambient" | "notice" | "demand")[]
  ): CodeHudDeskFocus.ISession[] =>
    urgencies.map((urgency, index) => ({
      id: `s${index + 1}`,
      directory: `/home/dev/projects/repo-${index + 1}`,
      urgency,
    }));

  // 1-4. Whose content wins.
  Assert.equals(
    "with nothing demanding, the session in focus is shown",
    CodeHudDeskFocus.showing(sessions("ambient", "ambient", "ambient"), 1)?.id,
    "s2",
  );
  Assert.equals(
    "a demand elsewhere takes the display",
    CodeHudDeskFocus.showing(sessions("ambient", "ambient", "demand"), 1)?.id,
    "s3",
  );
  Assert.equals(
    "the first one in opening order wins",
    CodeHudDeskFocus.showing(sessions("demand", "ambient", "demand"), 1)?.id,
    "s1",
  );
  Assert.equals(
    "a notice elsewhere does not",
    CodeHudDeskFocus.showing(sessions("ambient", "ambient", "notice"), 1)?.id,
    "s2",
  );
  Assert.equals(
    "and nothing at all shows nothing",
    CodeHudDeskFocus.showing([], 0),
    undefined,
  );

  // 5-6. What the wearer hears when they ask.
  const listed: string[] = CodeHudDeskFocus.listing(
    sessions("ambient", "ambient"),
    1,
    geometry,
    words,
  );
  Assert.equals("the list introduces itself", listed[0], words.listing);
  Assert.predicate(
    "numbered from one, which is the number they will say back",
    listed[1]?.startsWith("1. ") === true &&
      listed[2]?.startsWith("2. ") === true,
  );
  Assert.predicate(
    "named by what tells two checkouts apart",
    listed[1]?.includes("repo-1") === true,
  );
  Assert.predicate(
    "with the one on the display marked, and only that one",
    listed[2]?.includes(words.showing) === true &&
      listed[1]?.includes(words.showing) === false,
  );
  Assert.predicate(
    "and no line wider than the display it is read on",
    listed.every((line) => line.length <= geometry.columns + 8),
  );
  Assert.equals(
    "an empty list says so rather than reading out nothing",
    CodeHudDeskFocus.listing([], 0, geometry, words),
    [words.nosuch],
  );

  // 7. Selection, and the shape a misheard number takes.
  const three: CodeHudDeskFocus.ISession[] = sessions(
    "ambient",
    "ambient",
    "ambient",
  );
  Assert.equals(
    "the second session is the one at ordinal two",
    CodeHudDeskFocus.selected(three, 2),
    1,
  );
  for (const ordinal of [0, -1, 4, 99])
    Assert.equals(
      `${ordinal} names no session`,
      CodeHudDeskFocus.selected(three, ordinal),
      undefined,
    );
}
