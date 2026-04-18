import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ShellLayout } from "./ShellLayout";

describe("ShellLayout", () => {
  it("stacks the shell so the mobile tab bar sits above the workspace panes", () => {
    const { container } = render(
      <ShellLayout
        activeView="preview"
        onActiveViewChange={vi.fn()}
        sidebar={<div>Sidebar</div>}
        preview={<div>Preview</div>}
      />,
    );

    expect(container.querySelector("section")).toHaveClass("flex-col");
  });
});
