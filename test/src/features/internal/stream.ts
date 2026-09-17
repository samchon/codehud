import type {
  ICodeHudAgentEvent,
  ICodeHudGlassesDescriptor,
} from "@codehud/interface";

/**
 * Builders for observation streams and device geometries.
 *
 * Every case constructs its subject through these rather than sharing a
 * fixture, so a case that changes its arrangement cannot silently change
 * another's.
 */
export namespace Stream {
  /** The narrowest supported surface: two lines of monochrome green. */
  export const NARROW: ICodeHudGlassesDescriptor.IGeometry = {
    columns: 24,
    rows: 2,
    colored: false,
  };

  /** A device with room for a spoken hint under two lines of content. */
  export const WIDE: ICodeHudGlassesDescriptor.IGeometry = {
    columns: 48,
    rows: 4,
    colored: true,
  };

  /** The degenerate surface: one line, nothing else. */
  export const SINGLE: ICodeHudGlassesDescriptor.IGeometry = {
    columns: 20,
    rows: 1,
    colored: false,
  };

  let counter: number = 0;

  /** Resets the sequence counter so each case numbers from zero. */
  export const reset = (): void => {
    counter = 0;
  };

  const base = (): { session: string; sequence: number; at: number } => ({
    session: "s1",
    sequence: counter,
    at: counter++ * 1000,
  });

  export const session = (
    directory: string = "/home/dev/codehud",
  ): ICodeHudAgentEvent.ISession => ({
    ...base(),
    type: "session",
    model: "claude-opus-5",
    directory,
    resumed: false,
  });

  export const reasoning = (delta: string): ICodeHudAgentEvent.IReasoning => ({
    ...base(),
    type: "reasoning",
    delta,
  });

  export const message = (
    delta: string,
    complete: boolean,
  ): ICodeHudAgentEvent.IMessage => ({
    ...base(),
    type: "message",
    delta,
    complete,
  });

  export const tool = (
    call: string,
    title: string,
    phase: ICodeHudAgentEvent.ITool.Phase,
    failed?: boolean,
  ): ICodeHudAgentEvent.ITool => ({
    ...base(),
    type: "tool",
    call,
    name: "Edit",
    phase,
    title,
    ...(failed === undefined ? {} : { failed }),
  });

  export const permission = (
    request: string,
    title: string,
    detail?: string,
  ): ICodeHudAgentEvent.IPermission => ({
    ...base(),
    type: "permission",
    request,
    title,
    ...(detail === undefined ? {} : { detail }),
    options: [
      { id: "yes", label: "Allow", affirmative: true, persistent: false },
      { id: "always", label: "Always", affirmative: true, persistent: true },
      { id: "no", label: "Deny", affirmative: false, persistent: false },
    ],
  });

  export const result = (
    summary: string,
    outcome: ICodeHudAgentEvent.IResult.Outcome,
    ms: number = 4_200,
  ): ICodeHudAgentEvent.IResult => ({
    ...base(),
    type: "result",
    outcome,
    summary,
    elapsed: ms,
  });

  export const error = (
    message: string,
    fatal: boolean,
  ): ICodeHudAgentEvent.IError => ({
    ...base(),
    type: "error",
    message,
    fatal,
  });
}
