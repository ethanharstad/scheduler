# Feature Specification: Incident Preplanning

**Feature Branch**: `007-incident-preplanning`
**Created**: 2026-03-07
**Status**: Draft
**Input**: User description: "Incident Preplanning - A full NFPA 1620-aligned pre-incident planning system for emergency services organizations. Full pre-plan system with building info, occupancy, construction type, hazards, water supply/hydrants, access points, photo/document uploads, review scheduling, interactive map, floor plan uploads, Cloudflare R2 photo storage, and tiered plan limits."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Browse and Search Pre-Plans (Priority: P1)

Any logged-in member of an organization navigates to the pre-plans section and sees a list of all pre-plans for their organization. Each entry shows the location name, address, occupancy type, and review status (Current, Review Needed, Expired). The member can search by address or location name, and filter by occupancy type or review status. Clicking a pre-plan opens its full detail view with all captured data, photos, and floor plans.

**Why this priority**: Read access is the foundational capability. Firefighters and EMS personnel need to quickly pull up pre-plans en route to a scene. If crews cannot find and read pre-plans, nothing else matters.

**Independent Test**: Log in as an employee, navigate to the pre-plans section, confirm the list loads with location names, addresses, and status badges. Use the search bar to find a specific address. Click into a pre-plan and confirm all sections (building info, hazards, water supply, contacts, photos) render correctly.

**Acceptance Scenarios**:

1. **Given** an organization has pre-plans on file, **When** any member navigates to the pre-plans section, **Then** they see a list of all pre-plans showing location name, address, occupancy type, and review status.
2. **Given** the pre-plan list is displayed, **When** a member types an address or location name in the search bar, **Then** the list filters in real time to show only matching results.
3. **Given** the pre-plan list is displayed, **When** a member filters by occupancy type or review status, **Then** only pre-plans matching the selected filter are shown.
4. **Given** a member clicks on a pre-plan in the list, **When** the detail view opens, **Then** all sections are displayed: building identification, building characteristics, hazardous materials, water supply, access/egress, utility shutoffs, emergency contacts, special considerations, tactical notes, photos, and floor plans.
5. **Given** no pre-plans exist for the organization, **When** any member visits the pre-plans section, **Then** an informative empty state is displayed.

---

### User Story 2 - Create a Pre-Plan for a New Location (Priority: P2)

An authorized user (owner, admin, or manager) creates a new pre-plan. They first create or select a location by entering an address and optionally placing a pin on an interactive map to set GPS coordinates. Then they fill in the pre-plan form organized into sections: building identification (name, occupancy type, construction type), building characteristics (stories, square footage, fire protection systems), hazardous materials, water supply and hydrant info, access/egress points, utility shutoff locations, emergency contacts, special considerations, and tactical notes. They can upload photos and floor plan files. Upon saving, the pre-plan appears in the organization's list with a "Current" review status and a next-review-due date set to one year from creation.

**Why this priority**: Creating pre-plans is the core write operation. Without the ability to enter data, there is nothing to read, review, or manage. This story exercises the full data model.

**Independent Test**: Log in as a manager, navigate to the pre-plans section, click "New Pre-Plan", enter an address, place a pin on the map, fill in building details across all sections, upload a photo and a floor plan PDF, and save. Confirm the new pre-plan appears in the list with "Current" status.

**Acceptance Scenarios**:

1. **Given** an authorized user clicks "New Pre-Plan", **When** they enter an address, **Then** the system displays an interactive map where they can confirm or adjust the location pin.
2. **Given** an authorized user is filling out the pre-plan form, **When** they complete the required fields (location name, address, occupancy type, construction type) and save, **Then** the pre-plan is created with a "Current" review status and next-review-due date one year from today.
3. **Given** an authorized user is on the pre-plan form, **When** they upload photos (JPEG, PNG) and floor plan files (JPEG, PNG, PDF), **Then** the files are stored and displayed in the pre-plan detail view.
4. **Given** an authorized user leaves optional sections empty (e.g., hazardous materials), **When** they save, **Then** the pre-plan is created successfully with those sections shown as empty rather than errored.
5. **Given** an authorized user omits a required field, **When** they attempt to save, **Then** a validation error highlights the missing field and the pre-plan is not saved.
6. **Given** an employee (no management authority) is logged in, **When** they view the pre-plans section, **Then** no "New Pre-Plan" button or creation form is accessible.

---

### User Story 3 - Edit an Existing Pre-Plan (Priority: P3)

An authorized user opens an existing pre-plan and edits any field — updating building characteristics, adding newly discovered hazardous materials, uploading additional photos, or revising emergency contacts. On save, the last-modified timestamp updates. The review status and next-review-due date are not automatically changed by an edit (those are managed separately via the review action).

**Why this priority**: Pre-plans are living documents. Building conditions change, tenants rotate, and new hazards emerge. Editing is essential for keeping data current but depends on creation (P2) existing first.

**Independent Test**: Log in as an admin, open an existing pre-plan, change the number of stories and add a hazardous material entry, save, and confirm both changes persist on reload.

**Acceptance Scenarios**:

1. **Given** an authorized user opens a pre-plan detail view, **When** they click "Edit", **Then** all sections become editable with current values pre-populated.
2. **Given** an authorized user modifies fields and saves, **When** the detail view reloads, **Then** the updated values are displayed and the last-modified timestamp reflects the change.
3. **Given** an authorized user uploads additional photos during an edit, **When** they save, **Then** the new photos appear alongside any previously uploaded photos.
4. **Given** an authorized user removes a previously uploaded photo or floor plan, **When** they save, **Then** the file is removed from the pre-plan detail view.
5. **Given** an employee views a pre-plan, **When** they look at the controls available, **Then** no "Edit" button is visible.

---

### User Story 4 - Mark a Pre-Plan as Reviewed (Priority: P4)

An authorized user opens a pre-plan and performs the "Mark as Reviewed" action. This resets the review status to "Current" and sets the next-review-due date to one year from today. The reviewer's name and the review date are recorded. This is distinct from editing — a review confirms the existing data is still accurate without necessarily changing any fields.

**Why this priority**: NFPA 1620 recommends annual reviews. The review lifecycle is what differentiates a living pre-plan system from a static document store. However, it depends on pre-plans already existing (P2) and is a lighter interaction than full editing (P3).

**Independent Test**: Log in as a manager, find a pre-plan with "Review Needed" status, click "Mark as Reviewed", and confirm the status changes to "Current" with a new review-due date one year out.

**Acceptance Scenarios**:

1. **Given** an authorized user views a pre-plan with any review status, **When** they click "Mark as Reviewed", **Then** the status changes to "Current" and the next-review-due date is set to one year from today.
2. **Given** a pre-plan has been marked as reviewed, **When** any member views the detail page, **Then** the reviewer's name and review date are displayed.
3. **Given** a pre-plan's next-review-due date has passed, **When** any member views the pre-plan list, **Then** that pre-plan's status displays as "Expired".
4. **Given** a pre-plan's next-review-due date is within 30 days, **When** any member views the pre-plan list, **Then** that pre-plan's status displays as "Review Needed".
5. **Given** an employee views a pre-plan, **When** they look at the available actions, **Then** the "Mark as Reviewed" action is not available.

---

### User Story 5 - Manage Hydrants on the Map (Priority: P5)

An authorized user adds hydrant markers to the interactive map associated with a location. For each hydrant, they record the location (map pin), flow rate, hydrant type (e.g., dry barrel, wet barrel), connection sizes, and any access notes (e.g., "behind fence, key required"). Hydrants are visible on the map when viewing any pre-plan at that location. All org members can view hydrant information; only authorized users can add, edit, or remove hydrants.

**Why this priority**: Water supply is critical tactical information and a key differentiator of a pre-plan system over generic notes. However, it requires the map infrastructure (established in P2) and is additive to the core pre-plan data.

**Independent Test**: Log in as a manager, open a pre-plan, switch to the map view, add a hydrant marker, fill in flow rate and connection sizes, save, and confirm the hydrant appears on the map. Log in as an employee and confirm the hydrant is visible but not editable.

**Acceptance Scenarios**:

1. **Given** an authorized user is viewing a pre-plan's map, **When** they click "Add Hydrant" and place a pin, **Then** a form appears to enter hydrant details (flow rate, type, connection sizes, access notes).
2. **Given** an authorized user saves a hydrant, **When** the map reloads, **Then** the hydrant marker appears at the placed location with a distinct icon.
3. **Given** a hydrant exists on the map, **When** any member clicks the hydrant marker, **Then** a popup displays the hydrant's details (flow rate, type, connections, notes).
4. **Given** an authorized user clicks an existing hydrant, **When** they select "Edit" or "Remove", **Then** they can modify or delete the hydrant record.
5. **Given** multiple pre-plans exist at the same location, **When** any member views any of those pre-plans, **Then** the same hydrants are visible on the map (hydrants belong to the location, not individual pre-plans).

---

### User Story 6 - Manage Access Points and Utility Shutoffs on the Map (Priority: P6)

An authorized user marks access/egress points (entry doors, stairwells, fire escapes, knox box locations) and utility shutoff locations (gas, electric, water) as pins on the interactive map. Each pin has a type label and optional notes. These markers are visible to all org members when viewing the pre-plan.

**Why this priority**: Spatial awareness of access and utility points is high-value tactical information but follows the same map pattern established in P5 (hydrants). This extends the map with additional marker types.

**Independent Test**: Log in as a manager, open a pre-plan, add an access point marker labeled "Main Entrance — Knox Box" and a utility shutoff marker labeled "Gas Main Shutoff", save, and confirm both appear on the map with distinct icons.

**Acceptance Scenarios**:

1. **Given** an authorized user is viewing a pre-plan's map, **When** they click "Add Marker" and select a type (access point or utility shutoff), **Then** they can place a pin and enter details (type label, subtype, notes).
2. **Given** markers of different types exist on the map, **When** any member views the map, **Then** each marker type has a visually distinct icon (e.g., door icon for access, wrench icon for utility shutoff, hydrant icon for hydrants).
3. **Given** an authorized user saves a marker, **When** the pre-plan detail view is loaded, **Then** the marker appears in both the map and in a structured list within the relevant section (Access/Egress or Utility Shutoffs).

---

### User Story 7 - Delete a Pre-Plan (Priority: P7)

An authorized user can delete a pre-plan. A confirmation prompt warns that all associated data (photos, floor plans, hydrant records for the location if no other pre-plans reference it) will be permanently removed. After deletion, the pre-plan no longer appears in the list. The location record is preserved if other pre-plans still reference it.

**Why this priority**: Deletion is a necessary housekeeping capability but the least-used action. It must exist for data hygiene but is lower priority than all CRUD and review operations.

**Independent Test**: Log in as an admin, delete a pre-plan that has photos and floor plans, confirm the prompt, and verify the pre-plan is gone. Confirm associated files are no longer accessible.

**Acceptance Scenarios**:

1. **Given** an authorized user clicks "Delete" on a pre-plan, **When** the confirmation prompt appears, **Then** it clearly states the pre-plan name and warns that all associated photos, floor plans, and data will be permanently removed.
2. **Given** the user confirms deletion, **When** the list reloads, **Then** the pre-plan no longer appears.
3. **Given** a location has multiple pre-plans and one is deleted, **When** the remaining pre-plans are viewed, **Then** the location record, hydrants, and map markers associated with the location are preserved.
4. **Given** a location's last pre-plan is deleted, **When** the deletion is confirmed, **Then** the location record and its associated hydrants and map markers are also removed.
5. **Given** an employee views a pre-plan, **When** they look at the available actions, **Then** no "Delete" option is visible.

---

### Edge Cases

- What if two authorized users create pre-plans for the same address simultaneously? The system must check for existing locations by address and reuse the location record. If both create the location concurrently, the system must handle the conflict gracefully — either by deduplicating on save or by allowing both and providing a merge tool later.
- What if a photo or floor plan upload fails mid-transfer? The pre-plan save should still succeed for all text data; failed uploads should display a clear error with an option to retry the upload.
- What if a pre-plan has no GPS coordinates (address only)? The map should display a geocoded approximation or show a prompt to manually place the pin. The pre-plan is still valid without coordinates.
- What if the organization hits its tier limit for pre-plans? The system must block creation with a clear message explaining the limit and how to upgrade.
- What if a large floor plan file (e.g., 50MB PDF) is uploaded? The system must enforce a maximum file size and reject oversized files with a clear error.
- What if an authorized user tries to delete a photo that is referenced in a floor plan annotation (future feature)? For v1, photos and floor plans are independent — deleting one does not affect the other.
- What if a pre-plan's review status is "Expired" and the pre-plan is edited but not explicitly reviewed? The status remains "Expired" — only the explicit "Mark as Reviewed" action resets the review cycle.
- What if the map provider is unavailable? The pre-plan form and detail view must still be functional with degraded map display. Address and coordinate fields should remain editable as text.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Authorized users (owner, admin, manager) MUST be able to create a new pre-plan by providing at minimum: a location name, street address, occupancy type, and construction type.
- **FR-002**: The system MUST support creating and reusing location records. A location is identified by its street address. When creating a pre-plan, if a location with the same address already exists, the system MUST offer to reuse it rather than creating a duplicate.
- **FR-003**: Each location MUST store: name, street address (street, city, state, ZIP), and optional GPS coordinates (latitude, longitude). GPS coordinates MAY be set via an interactive map pin or entered manually.
- **FR-004**: The system MUST display an interactive map on location creation and pre-plan detail views, centered on the location's coordinates or geocoded address.
- **FR-005**: Each pre-plan MUST capture the following NFPA 1620-aligned data sections, all optional except where noted in FR-001:
  - Building identification: location name (required), occupancy type (required), construction type (required)
  - Building characteristics: number of stories, approximate square footage, roof type, sprinkler system (yes/no/partial + type), fire alarm system (yes/no + type), standpipe (yes/no + type)
  - Hazardous materials: repeating entries with material name, quantity, UN/NA number, location within building, and special handling notes
  - Water supply: narrative notes on water mains and supply adequacy (hydrants are managed separately on the map)
  - Access/egress: repeating entries with description, type (main entrance, fire escape, stairwell, elevator, knox box), and optional map pin reference
  - Utility shutoffs: repeating entries with utility type (gas, electric, water, other), location description, and optional map pin reference
  - Emergency contacts: repeating entries with name, role/title, phone number, and email
  - Special considerations: free-text field for rescue concerns, structural weaknesses, renovation status, or other tactical notes
  - Tactical notes: free-text field for suggested staging areas, command post locations, and tactical approach guidance
- **FR-006**: Authorized users MUST be able to upload photos (JPEG, PNG) and floor plan files (JPEG, PNG, PDF) to a pre-plan. Each file MUST have an optional caption.
- **FR-007**: The system MUST enforce a maximum file size of 25 MB per upload and a maximum of 50 files (photos + floor plans combined) per pre-plan.
- **FR-008**: Uploaded files MUST be stored in Cloudflare R2 using a dedicated bucket.
- **FR-009**: The system MUST track a review lifecycle for each pre-plan with: last-reviewed date, next-review-due date, and a computed review status. Review status is "Current" when today is before the next-review-due date minus 30 days, "Review Needed" when today is within 30 days of the next-review-due date, and "Expired" when today is past the next-review-due date.
- **FR-010**: Authorized users MUST be able to perform a "Mark as Reviewed" action on any pre-plan. This action sets the last-reviewed date to today, records the reviewer's identity, and sets the next-review-due date to one year from today.
- **FR-011**: Authorized users MUST be able to edit all fields of an existing pre-plan. Editing a pre-plan MUST NOT automatically change the review status or next-review-due date.
- **FR-012**: Authorized users MUST be able to delete a pre-plan after confirming through a warning prompt. Deletion removes the pre-plan and its uploaded files. If the location has no remaining pre-plans, the location and its map markers (hydrants, access points, utility shutoffs) are also removed.
- **FR-013**: All organization members MUST be able to view all pre-plans, locations, and map markers in read-only mode. Create, edit, review, and delete controls MUST be hidden from users who lack authorization.
- **FR-014**: Authorized users MUST be able to add, edit, and remove hydrant markers on a location's map. Each hydrant stores: GPS coordinates (pin), flow rate (GPM), hydrant type, connection sizes, and access notes.
- **FR-015**: Authorized users MUST be able to add, edit, and remove access point and utility shutoff markers on a location's map. Each marker stores: GPS coordinates (pin), type, subtype, and notes.
- **FR-016**: The pre-plan list MUST support searching by location name or address, and filtering by occupancy type and review status.
- **FR-017**: The system MUST enforce per-tier limits on the number of pre-plans per organization: Free tier is limited to 5, Basic tier to 50, and Pro tier is unlimited. When the limit is reached, the system MUST block creation with a clear upgrade prompt.
- **FR-018**: Multiple pre-plans MAY exist for the same location (e.g., separate plans per building wing or per hazard type). Hydrants and map markers belong to the location and are shared across all pre-plans at that location.

### Key Entities

- **Location**: Represents a physical site. Stores a name, street address (street, city, state, ZIP), and optional GPS coordinates (latitude, longitude). Scoped to an organization. Multiple pre-plans may reference the same location. Hydrants and map markers (access points, utility shutoffs) are associated with the location, not individual pre-plans.
- **Pre-Plan**: The core document representing a pre-incident plan for a location. References a location. Contains all NFPA 1620-aligned data sections: building identification, building characteristics, hazardous materials (as repeating sub-entries), water supply notes, access/egress points (as repeating sub-entries), utility shutoffs (as repeating sub-entries), emergency contacts (as repeating sub-entries), special considerations, and tactical notes. Tracks creation timestamp, last-modified timestamp, created-by user, last-reviewed date, reviewed-by user, and next-review-due date. Review status is computed (not stored) based on today's date relative to the next-review-due date.
- **Pre-Plan File**: Represents a photo or floor plan file uploaded to a pre-plan. Stores a reference to the R2 object key, the original filename, MIME type, file size, an optional caption, upload timestamp, and the uploading user's identity. Associated with exactly one pre-plan.
- **Hydrant**: Represents a fire hydrant near a location. Associated with a location (not a pre-plan). Stores GPS coordinates, flow rate in GPM, hydrant type (dry barrel, wet barrel, other), connection sizes (as a text description), and access notes.
- **Map Marker**: Represents an access point or utility shutoff marked on a location's map. Associated with a location. Stores GPS coordinates, category (access point or utility shutoff), type label (e.g., "Main Entrance", "Gas Shutoff"), and optional notes.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: An authorized user can create a complete pre-plan (all sections filled, two photos uploaded, one floor plan uploaded) in under 10 minutes.
- **SC-002**: Any organization member can find a specific pre-plan by address search and open its detail view in under 15 seconds.
- **SC-003**: The review lifecycle accurately reflects status — pre-plans display "Review Needed" starting 30 days before their due date, and "Expired" once the due date passes, with zero manual intervention.
- **SC-004**: All pre-plan data sections defined in NFPA 1620 (building identification, characteristics, hazardous materials, water supply, access/egress, utility shutoffs, emergency contacts, special considerations) are capturable through the system without requiring external tools or documents.
- **SC-005**: Uploaded photos and floor plans are retrievable and viewable within the pre-plan detail view within 3 seconds of page load.
- **SC-006**: Organization members can view hydrant locations and details on the interactive map without any management permissions.
- **SC-007**: The tier-based pre-plan limit is enforced consistently — Free-tier organizations cannot create a 6th pre-plan, and a clear upgrade message is displayed.
- **SC-008**: An authorized user can complete the "Mark as Reviewed" action on a pre-plan in under 30 seconds, and the updated status is immediately visible to all org members.

## Assumptions

- Pre-plans are scoped to the organization level. Department or station sub-scoping is out of scope for v1 (consistent with the current org-level hierarchy).
- "Authorized users" for pre-plan management are those with the existing `create-edit-schedules` permission: owner, admin, and manager. No new RBAC permissions are introduced in v1. If a dedicated pre-plan permission is needed later, it can be added without schema changes to the pre-plan tables.
- The interactive map component will use a third-party mapping library (e.g., Leaflet with OpenStreetMap tiles or Mapbox). The specific provider is an implementation decision, not a spec concern.
- Geocoding (converting addresses to GPS coordinates) may require a third-party service. If unavailable, users can manually place the map pin or enter coordinates. The system does not depend on geocoding for core functionality.
- Floor plan uploads are image or PDF files only. No built-in diagram editor, annotation tool, or NFPA symbol library is included in v1. Annotation support is deferred to a future version.
- File storage uses Cloudflare R2 with a new dedicated bucket (separate from the existing `PROFILE_PHOTOS` bucket). The bucket name and configuration are implementation decisions.
- The 25 MB per-file and 50-file-per-preplan limits are initial defaults. They may be adjusted based on real-world usage without a spec change.
- Review cycle is fixed at one year (365 days). Configurable review intervals are out of scope for v1.
- The "Review Needed" threshold (30 days before due date) is fixed. A configurable threshold is out of scope for v1.
- Hydrants, access points, and utility shutoffs are associated with locations, not individual pre-plans. This means all pre-plans at a given location share the same set of map markers. This is intentional — tactical infrastructure belongs to the site, not to any single document about it.
- Occupancy types follow standard categories (Assembly, Business, Educational, Factory, Hazardous, Institutional, Mercantile, Residential, Storage, Utility). The exact list is an implementation decision.
- Construction types follow standard NFPA/ISO classifications (Type I through Type V). The exact list is an implementation decision.
- No integration with external CAD (Computer-Aided Dispatch) systems in v1. Pre-plans are accessed through the application's own interface.
- No offline/PWA support for pre-plans in v1. Field access requires an active network connection.
- Tier limits (Free: 5, Basic: 50, Pro: unlimited) apply to the count of pre-plans, not locations or files. Existing pre-plans are not deleted or hidden if an organization downgrades to a lower tier — only new creation is blocked.

## Dependencies

- **004-org-rbac**: `create-edit-schedules` permission (for write access) and `view-schedules` permission (for read access) are used to gate pre-plan management and viewing respectively.
- **005-staff-management**: Staff member identities are referenced as the creator, editor, and reviewer of pre-plans.
- **002-user-profile**: User display names are shown in reviewer and creator attribution.
