# Archivist

## Introduction

Archivist is a background event loop responsible for overseeing the archival of incidents that have reached a conclusion. It periodically examines the incidents in memory and processes them to be archived if they meet the determined criteria.

## How It Works

### Event Loop
The `eventLoop` function drives the Archivist, iterating over the currently tracked incidents and determining whether they are eligible for archival based on their state.

### Archival Criteria
An incident is considered ready for archival when the `ARCHIVE` action from the incident's finite state machine is successful. This typically means the incident has been completed or canceled and all necessary follow-up actions have been completed.

### Incident Archiving
Upon determining that an incident should be archived:

1. The incident's data is archived in the database.
2. If database archival is successful, the incident is removed from `robot.incidents` tracking.
3. The associated chat room (if any) is archived through the `robot.adapter.archiveRoom` method.

### Cleanup

Archivist also removes incidents from memory if the state of an incident is found to be already `Archived` for some reason due to any unforeseen errors or discrepancies.

## Usage
The use of Archivist is mostly automated and requires minimal manual intervention once configured:

### Starting and Stopping Archivist
- **Starting**: To initialize the Archivist event loop, invoke the `startArchivist` function, which sets up a repeating interval task using `setInterval` to trigger `eventLoop`.
- **Stopping**: To terminate the event loop, use the `stopArchivist` function to clear the interval set by `startArchivist`.
