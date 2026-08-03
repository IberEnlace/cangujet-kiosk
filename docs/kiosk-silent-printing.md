# MORROW kiosk silent printing

The Pay at Cashier ticket is rendered as the existing 80mm receipt in an
off-screen frame. Production Chrome must be started with `--kiosk-printing` so
the frame is sent directly to the Windows default printer without a print
dialog.

1. Set the 80mm receipt printer as the Windows default printer.
2. Set `MORROW_KIOSK_URL` when the production URL is not
   `http://localhost:5173`.
3. Start the kiosk with `npm run kiosk:chrome`.

The launcher supplies both `--kiosk` and `--kiosk-printing`. Do not launch the
production kiosk from an ordinary Chrome shortcut: Chrome exposes no web API
that can enable or detect kiosk printing after startup.

In development, the service retains a popup/window print fallback for manual
receipt inspection. Production never falls back to that dialog path; an
unavailable silent frame is reported as a recoverable printer error instead.
