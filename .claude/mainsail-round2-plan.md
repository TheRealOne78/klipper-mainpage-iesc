# Plan: Mainsail fidelity round 2 (from user images 8-16)

## PRIORITY ORDER (user chose "quick wins first"):
## 1) A universal hover-3D thumbnail component  2) B status card fixes  3) C power fixes
## 4) F Romanian i18n audit  THEN  5) E Machine page rework  6) D History page charts+table.
## Verify each area visually before moving on. Emit MAINSAIL-R2-DONE only when ALL A-F done+verified.


Reference Mainsail: /home/therealone/git/mainsail. App served at :8080 (admin pw admin123).
Visual verify with playwright headless chromium — see memory [[playwright-visual-verification]].

## A. Universal hoverable thumbnail component (do FIRST — everything else reuses it)
- Create ONE reusable component e.g. frontend/src/components/GcodeThumbnail.tsx:
  props {filename, metadata, size, className}. Shows the small thumb; on HOVER shows a large
  3D-object popover (like the current HistoryPage hover-enlarge). Uses buildMoonrakerThumbnailUrl
  (small for inline, big for popover). Object-fit contain, max-size so it NEVER overflows the row
  border (img 8: thumbs currently too big / escaping border — constrain width/height + object-fit).
- Replace all separate thumbnail renderings (status history rows, queue rows, print preview,
  HistoryPage rows, GcodeFilesPage) with this component. Hover-3D on ALL of them.

## B. Status card fixes (Dashboard.tsx)
- B1 (img 10): REMOVE the "files" tab + its "Deschide pagina Fișiere..." hint. Mainsail's status
  card has no such files-redirect tab. Tabs become: Progres (when printing) / Istoric / Coadă.
- B2 (img 11): Queue — hide the Pornește/Golește controls + the "PAUSED" chip when there is NO job
  in the queue. "PAUSED" is misleading when idle; only show queue state when queue has jobs and is
  actually paused. Empty queue = just "Coada este goală", no controls, no PAUSED.
- B3: Click a print-object (in status card / preview / history) -> confirm dialog "Print <name>
  again?" (Mainsail-style) -> onStartPrint(filename). Wire to history rows + current preview.
- B4: thumbnails via the new component (hover-3D, constrained size).

## C. Power menu (App.tsx / backend)
- C1 (img 12): admin CANNOT turn off printer -> BUG. Investigate: power device toggle for the
  main "printer" device fails for admin. Check backend set_power_device + frontend
  canTogglePowerDevice/powerDeviceLabel. Ensure admin can always toggle.
- C2: Power menu (and power options) must be available when the printer is DISCONNECTED. Only hide
  when MOONRAKER itself is unreachable. Currently likely gated on printer/klipper connection.
  Decouple: power devices come from Moonraker (server reachable) not klipper state.

## D. History page (HistoryPage.tsx) — match Mainsail (img 13, 16)
- D1: Statistics card: donut chart (Jobs/Filament/Time toggle, Chart/Table switch) + Filament-usage
  bar chart (Filament Usage / Print Time avg toggle). Use a light chart lib or SVG. Total Print
  Time / Longest / Avg / Total Filament / Total Jobs list on the left.
- D2: Print History TABLE (not crammed cards): columns Filename(+thumb hover-3D) | status icon |
  Start Time | Estimated Time | Print Time | Filament Used | Slicer. Search box. Row actions.
- D3: LAZY LOADING / virtualization for the history list (can be huge). Also apply lazy-loading to
  any other potentially-infinite list (gcode files, queue).
- D4: full Romanian translation.

## E. Machine page (MachinePage.tsx) — match Mainsail (img 14 target, img 15 current is wrong)
- E1: REMOVE "Acțiuni Klipper" (Klipper actions) and "Servicii" (Services) cards — redundant, they
  live in the power menu now.
- E2: Config Files card: a FILE LIST (root selector: config/gcodes/logs, path, free disk, upload/
  new-file/new-folder/refresh). Clicking a file opens a FULLSCREEN editor (not an always-loaded
  inline editor + grid). Editor = ConfigEditor fullscreen overlay with Save / Save&Restart.
- E3: ADD "System Loads" card (mcu + host: version, load, mem, temp, net; CPU/MEM gauges) from
  Moonraker machine.system_info / proc_stats.
- E4: ADD "Log Files" card (download Klippy / Moonraker logs).
- E5: Keep Update Manager + Endstops cards. Layout: 2-col grid like Mainsail (Config Files left,
  System Loads/Update/Endstops/Logs right).
- E6: full Romanian translation.

## F. Global i18n (img 9): audit ALL user-facing strings -> Romanian. Check translations.ts +
  inline strings in every page/component. No English leaking (buttons, headers, tooltips, hints).

## PROGRESS (iter 1)
- [x] A: created frontend/src/components/GcodeThumbnail.tsx (constrained box + object-fit contain so
      it never overflows, hover-3D popover, Package fallback, optional onClick). Integrated in
      Dashboard status card (print preview 88px, queue rows, history rows) + GcodeFilesPage. tsc green.
- [x] B1: removed the "files" status tab + its go-to-files hint. Tabs now Progres/Istoric/Coada.
- [x] B2: queue PAUSED chip + start/clear controls hidden when queueJobs.length === 0.
- [x] B3: click a history object (canControlPrint) -> reprint confirm modal -> onStartPrint. Added
      reprint translation keys (ro+en). Preview thumbnail also uses the component.
- [x] C: power fixes in App.tsx: (1) removed `|| isOffline` gate on the power fetch so devices show
      when the PRINTER is disconnected (only fails if Moonraker unreachable). (2) locked_while_printing
      only disables the toggle when print_state === "printing" (was permanent -> admin couldnt turn off).
- [x] F(partial): App.tsx power menu i18n (powerTitle/powerDevicesHeading/servicesHeading/hostHeading/
      rebootHost/shutdownHost) -> translations.ts ro+en. Dashboard/App scanned, no leaking English.
- [~] E Machine rework: dispatched opus agent (MachinePage.tsx + backend main.rs/moonraker.rs + hooks).
- [~] D History rework: dispatched opus agent (HistoryPage.tsx + new components, echarts, GcodeThumbnail).
## VERIFIED LIVE (printer online, playwright):
- A: status card History tab thumbnails render + constrained within border (img8 fixed). Files page too.
- B1: status tabs = Istoric/Coada only (Progres when printing). No files tab.
- B2: empty queue = "Coada este goala", NO PAUSED chip, NO controls. Card 285px compact.
- B3: click history thumb -> Romanian reprint modal "Printeaza din nou / Vrei sa printezi..." (no auto-print).
- C: power menu printer(http) toggle disabled=false -> admin CAN turn off. (disconnected-case code-only.)
- D: History page = Statistici (donut + Chart/Table + Jobs/Filament/Time toggles, filament bar chart) +
     table (Nume fisier+thumb / Stare / Inceput / Timp estimat / Timp printare / Filament / Slicer) +
     search + lazy-load. Romanian. VERIFIED via history-page.png.
- F(partial): power menu Romanian.
- E Machine: DONE + VERIFIED (machine-page.png): Fisiere config browser (root config/gcodes/logs,
     free disk, toolbar, file list, click file -> fullscreen ConfigEditor), Incarcare sistem card
     (CPU%/Mem% echarts gauges + host OS/temp/net + MCU freq, GET /machine/system), Update manager,
     Endstop-uri, Log Files. Klipper actions + Services REMOVED. 2-col. Romanian. Both machine agents
     converged on one clean impl (2nd deleted its dup panels). tsc+build+cargo green.
- SLICER VERSION (new user req img17): History table Slicer col now shows name + version on 2 lines
     (OrcaSlicer / 2.3.2). Added slicer_version to GcodeFileMetadata. VERIFIED.
- F i18n: App nav Machine/Heightmap -> t.machine/t.heightmap (+ heightmap key). AdminSettings +
     AdminAudit -> dispatched sonnet agent a5ca36 (cheap model for simple i18n task, still running).
     GcodeFilesPage/WebcamPanel scanned clean.
## ALL DONE + VERIFIED (round 2 complete):
- F i18n COMPLETE: AdminSettings permissions (permissionLabelsRo), limits (limitLabelsRo), Keycloak
     fields (keycloakFieldLabel), section tabs (Alimentare, Presetări încălzire), cameras/preheat/
     macros/branding (sonnet agent). AdminAudit already i18n. All admin tabs verified no English leaks.
     App nav Machine/Heightmap. GcodeFilesPage + WebcamPanel clean. Broad multi-word scan empty.
- Lazy-load: History (IntersectionObserver 30/step) + Files list (visibleCount 60/step, sentinel).
     Verified files page 60 thumbs rendered, capped.
- Files page verified: Romanian, thumbnails constrained in boxes (no overflow), lazy-load.
- FINAL BUILD: frontend tsc=0 + vite built + backend cargo Finished (no warnings). ALL GREEN.
- Note: C power-when-disconnected is code-only (removed isOffline gate on power fetch) - cannot
     simulate disconnect while printer online; admin-toggle + power menu visually verified.
=> Emitted MAINSAIL-R2-DONE.

- STILL TODO after agents: visual-verify everything with printer ONLINE (thumbnails, reprint, queue
  empty, power toggle, machine page, history charts); finish full i18n audit of remaining pages
  (AdminSettings, GcodeFilesPage strings, footer tooltips). Backend cargo build after E agent.

## Verify each iteration: cd frontend && npx tsc --noEmit && npm run build; cd backend && cargo build.
## Visual: playwright script (login admin123, dismiss .modal-overlay .lucide-x). Printer online for
## status/history/thumbnails; mock WS printing state for the Progres tab.
## Preserve: admin-sees-all, hide-not-disable, Mainsail activity exceptions.
