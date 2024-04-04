# Syntrax

## Introduction

Syntrax is a background event loop designed to synchronize incident data with an external issue tracking system at regular intervals. It randomly staggers the synchronization tasks to distribute the load and prevent simultaneous execution peaks.

## How It Works

### Synchronization Process
The synchronization process involves these key pieces:

- **Jitter**: To avoid overwhelming the issue tracker with simultaneous syncs, a configurable random jitter time is introduced before each sync operation begins.
- **Synchronization**: The actual synchronization operation that sends data to the issue tracker, updating incident details and log entries based on the current state of each incident.

### Event Loop
The `eventLoop` function executes periodically and performs the following:

1. Fetches the incidents requiring synchronization since the last run.
2. Logs how many incidents require syncing.
3. Iterates over the incidents, invoking the sync operation for each while including a random jitter to spread out the requests.
4. Updates the timestamp of the last run after all sync operations have been settled.

## Usage
Syntrax simplifies the sync process with external trackers and requires minimal set-up. By default, it runs at intervals of 64 seconds, but this can be configured to fit specific system needs.

The `startSyntrax` function sets up a periodic interval using `setInterval` that triggers the `eventLoop`. It uses a predefined default loop interval but can also be configured using the system configuration.

The `stopSyntrax` function is provided to clear the interval and stop Syntrax if needed.