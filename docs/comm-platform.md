# Comm Platform 

## Introduction

Communication platforms, expressed programmatically in the `CommPlatform` interface, encompass the essential parts of distributed incident management communication.

The interface abstracts the underlying details of the communication platform, whether it's Slack, Matrix, or something else.

## Overview

### Incident Room Management
- Operations to create and manage dedicated rooms for incidents.
- Automated messages for new incidents to inform and gather the required participants.

### Communication Prompts
- Notifications for various incident stages such as new, mitigated, resolved, and completed incidents.
- Specialized "nag" functions to prompt users when updates are needed or actions are pending.

### Information Dissemination
- Functions to send structured information like components affected, ongoing blockers, and summary updates.
- Message templates to ensure that communications follow a standard format.

### Role and Responsibility Handling
- Specific operations to notify team members when roles like point, triage, or engineering lead are taken over.
- Support for runbook links to ensure responders have quick access to procedural guides.

### Real-Time Updates
- Reactive operations like replying, updating, and reacting to messages in real-time.
- Ability to update incident specifics like affected components, contributing factors, and actions items.

### User Interaction
- User resolution to translate user IDs to emails or names, and vice versa.
- Timezone support to cater for different user locales.

### Room and Message Management
- Functions to manage room participation, update topics, archive rooms, and retrieve message permalinks.

### Help and Guidance
- Sending of help messages and tutorial steps to guide users through the incident management process.
- Display of available commands to help users interact with the system correctly.
