# Annoyotron

## Introduction

Annoyotron is a background event loop designed to nag active incidents for timely communications. It leverages short-lived finite state machines to determine when to send which nags.

![Annoytron finite state machine](assets/fsm-annoyotron.png)

## How It Works

### Nag States
Annoyotron maintains a set of nag states for each incident:

- **mostRecentCommUpdate**: Timestamp of the most recent communication update.
- **lastNags**: An object that stores timestamps for different types of nags, namely `noComms`, `noPoint`, and `needCommUpdate`.

A `nagMap` object stores the nag states indexed by the `incidentId`. It serves as a simple memory for the Annoyotron by keeping track of the notifications already sent for incidents.

### Invoking Nags
The `invokeNags` function executes the nag operations on a given incident wrapped in an Annoyotron state machine.

It sends out messages through the provided `robot.adapter` methods when conditions are met and updates the `lastNags` timestamps accordingly.

### Event Loop
The `eventLoop` function performs the following actions:

1. Fetches the most recent communication updates for incidents.
2. Iterates over active incidents, checking if they require nagging based on priority and if mitigated or not.
3. Initializes an Annoyotron state machine for the incidents not filtered out.
4. Invokes nags based on the state machine.

## Usage
Annoyotron requires minimal configuration. It uses a default loop interval of 42 seconds, which can be adjusted if needed via config.

The `startAnnoyotron` function sets up a periodic interval using `setInterval` that triggers the `eventLoop`. It uses a predefined default loop interval but can also be configured using the system configuration.

The `stopAnnoyotron` function is provided to clear the interval and stop the Annoyotron when it's no longer needed.

