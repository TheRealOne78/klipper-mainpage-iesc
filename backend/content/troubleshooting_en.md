# Guide

![Creality Ender-3 Pro](/ender3_cover.png)

## Standard Procedures

### Loading & Changing Filament:
1. Preheat the hotend to **200°C** (for PLA).
2. Cut the filament tip at a 45-degree angle.
3. Squeeze the extruder lever (near the stepper motor) and manually push the filament through the Bowden tube until clean plastic extrudes from the nozzle.

### Manual Bed Leveling:
1. Home the printer axes (**G28**).
2. Disable the stepper motors (Steppers Off).
3. Move the print head manually over the 4 bed leveling screws.
4. Slide a sheet of standard A4 paper under the nozzle: adjust the wheel under that corner until the nozzle grabs the paper slightly when you slide it. Repeat this process twice for all 4 corners.

# Troubleshooting

## What to do if...

* **The first layer is not sticking (poor adhesion):**
  - The bed is too far from the nozzle. Gently tighten/adjust the leveling wheels while the skirt is printing to raise the bed.
  - Clean the cold bed surface with Isopropyl Alcohol (IPA) to remove fingerprint oils.
* **Extruder is clicking (skipping steps):**
  - The nozzle is too close to the bed, restricting flow. Lower the bed slightly at that corner.
  - The nozzle is clogged. Preheat to 230°C and use the cleaning needle to clear the block.
* **The printer is offline:**
  - Make sure the USB cable connecting the Ender 3 Pro to the Raspberry Pi is securely plugged in.
  - Verify that the printer's main power supply switch (on the back of the PSU) is turned ON.
