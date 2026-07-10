import { describe, expect, it, vi } from "vitest";
import { StrictMode } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AdminSettings } from "./AdminSettings";
import type { AdminConfig } from "../usePrinterState";
import { ToastProvider } from "../contexts/ToastContext";

// Regression suite for the "event.currentTarget nulled after the synchronous
// handler returns" class of crash: React (with StrictMode, which this app
// runs under — see src/main.tsx) double-invokes setState functional updaters
// in development. Any onChange handler that reads `event.currentTarget`
// *inside* a `setState(current => ...)` closure (instead of extracting the
// value synchronously first) throws "Cannot read properties of null" on the
// second invocation. Every test here renders under <StrictMode> specifically
// so a reintroduced instance of this bug fails the suite, not just a live
// click-test.

function baseGroupPermissions() {
  return {
    view_status: true,
    view_temps: true,
    view_temp_target: true,
    control_temps: false,
    view_webcam: true,
    view_toolhead: true,
    control_toolhead: false,
    view_macros: true,
    run_macros: false,
    view_console: false,
    send_console: false,
    view_speed: true,
    view_files: true,
    manage_files: false,
    view_power: true,
    control_power: false,
    control_machine: false,
    upload_gcode: false,
    control_print: true,
    view_gcode_viewer: true,
    view_heightmap: true,
    open_mainsail: true,
    open_fluidd: true,
    open_octoprint: true,
    max_speed_factor: 200,
    max_jog_step: 10,
    max_upload_mb: 250,
    allow_movement_while_printing: false,
    allow_home_for_guests: false,
    power_devices: {},
    allowed_macros: [],
  };
}

function makeConfig(): AdminConfig {
  return {
    server: { host: "127.0.0.1", port: 8080 },
    auth: { admin_password_hash: "", guest_password_hash: null },
    moonraker: { url: "http://127.0.0.1:7125" },
    mainsail: { url: "" },
    safety: { max_hotend_temp: 260, max_bed_temp: 110 },
    branding: {
      app_name: { default: "Test Portal" },
      organization_name: {},
      moron_warning_text: {},
      logo_light: {},
      logo_dark: {},
      favicon: {},
      danger_image: {},
    },
    theme: { font_family: "sans-serif" },
    preheat: {
      pla: { hotend: 200, bed: 60 },
    },
    webcams: [],
    groups: [
      {
        id: "anonymous",
        display_name: "Anonymous",
        built_in: true,
        permissions: baseGroupPermissions(),
      },
      {
        id: "guest",
        display_name: "Guest",
        built_in: true,
        permissions: baseGroupPermissions(),
      },
      {
        id: "admin",
        display_name: "Administrator",
        built_in: true,
        permissions: baseGroupPermissions(),
      },
    ],
    footer_links: [],
  } as unknown as AdminConfig;
}

function renderAdminSettings() {
  const config = makeConfig();
  const props = {
    lang: "en" as const,
    role: "admin",
    portalConfig: null,
    getAdminConfig: vi.fn().mockResolvedValue(config),
    getAdminMacros: vi.fn().mockResolvedValue([]),
    getAdminPowerDevices: vi.fn().mockResolvedValue([]),
    updateAdminConfig: vi.fn().mockImplementation((c: AdminConfig) => Promise.resolve(c)),
    uploadAdminAsset: vi.fn().mockResolvedValue(config),
    uploadAdminFont: vi.fn().mockResolvedValue(config),
    uploadFooterLinkIcon: vi.fn().mockResolvedValue(config),
    changeAdminPassword: vi.fn().mockResolvedValue(undefined),
    getAdminUsers: vi.fn().mockResolvedValue([]),
    createAdminUser: vi.fn().mockResolvedValue(undefined),
    deleteAdminUser: vi.fn().mockResolvedValue(undefined),
    setAdminUserGroup: vi.fn().mockResolvedValue(undefined),
    resendAdminUserVerification: vi.fn().mockResolvedValue(undefined),
    refreshConfig: vi.fn(),
  };
  const utils = render(
    <StrictMode>
      <ToastProvider>
        <AdminSettings {...props} />
      </ToastProvider>
    </StrictMode>,
  );
  return { ...utils, props };
}

describe("AdminSettings — event.currentTarget crash regression", () => {
  it("adding a group and editing its id does not throw", async () => {
    renderAdminSettings();
    // Wait for the async getAdminConfig() load to resolve and render Groups.
    await screen.findByText(/Add group/i);

    fireEvent.click(screen.getByText(/Add group/i));

    // The newly added group's <details> card is the last one — expand it.
    const summaries = document.querySelectorAll(".admin-group-summary");
    const lastSummary = summaries[summaries.length - 1] as HTMLElement;
    fireEvent.click(lastSummary);

    const card = lastSummary.closest(".admin-group-card") as HTMLElement;
    const idInput = within(card).getAllByRole("textbox")[0] as HTMLInputElement;

    // This is the exact interaction that crashed before the fix: typing
    // triggers a state update whose closure used to read a nulled
    // event.currentTarget on React's StrictMode double-invocation.
    expect(() => {
      fireEvent.change(idInput, { target: { value: "advanced-users" } });
    }).not.toThrow();

    expect(idInput.value).toBe("advanced-users");
  });

  it("adding a camera and editing its stream URL does not throw", async () => {
    renderAdminSettings();
    await screen.findByText(/Add group/i);

    const tabs = document.querySelector(".admin-settings-tabs") as HTMLElement;
    fireEvent.click(within(tabs).getByText(/Cameras/i));
    fireEvent.click(screen.getByText(/Add camera/i));

    const rows = document.querySelectorAll(".admin-camera-row");
    const lastRow = rows[rows.length - 1] as HTMLElement;
    const inputs = within(lastRow).getAllByRole("textbox") as HTMLInputElement[];
    // name, streamUrl, snapshotUrl in that order per the row markup.
    const streamUrlInput = inputs[1];

    expect(() => {
      fireEvent.change(streamUrlInput, {
        target: { value: "http://example.com/stream" },
      });
    }).not.toThrow();

    expect(streamUrlInput.value).toBe("http://example.com/stream");
  });

  it("adding a preheat preset and renaming it does not throw", async () => {
    renderAdminSettings();
    await screen.findByText(/Add group/i);

    const tabs = document.querySelector(".admin-settings-tabs") as HTMLElement;
    fireEvent.click(within(tabs).getByText(/Preheat presets/i));
    fireEvent.click(screen.getByText(/Add preset/i));

    const rows = document.querySelectorAll(".admin-preheat-row");
    const lastRow = rows[rows.length - 1] as HTMLElement;
    const nameInput = within(lastRow).getAllByRole("textbox")[0] as HTMLInputElement;

    expect(() => {
      fireEvent.change(nameInput, { target: { value: "custom_filament" } });
    }).not.toThrow();

    expect(nameInput.value).toBe("custom_filament");
  });

  it("toggling a group permission checkbox does not throw", async () => {
    renderAdminSettings();
    await screen.findByText(/Add group/i);

    const firstSummary = document.querySelector(".admin-group-summary") as HTMLElement;
    fireEvent.click(firstSummary);
    const card = firstSummary.closest(".admin-group-card") as HTMLElement;
    const checkbox = within(card).getAllByRole("checkbox")[0] as HTMLInputElement;
    const wasChecked = checkbox.checked;

    expect(() => {
      fireEvent.click(checkbox);
    }).not.toThrow();

    expect(checkbox.checked).toBe(!wasChecked);
  });
});
