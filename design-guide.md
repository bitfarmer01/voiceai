Braindump – UI Development Plan (Phase I MVP)

1. Marketing & Entry Screens (Pre-Auth)
1.1 Landing Page
Purpose
Convert first-time visitors into signed-up users by clearly communicating value and reducing cognitive load.
Screen description
Clear headline communicating the core promise: turning mental chaos into clarity
Short subtext explaining the flow: dump thoughts → get clarity → feel accomplished
Single primary CTA: “Start your first brain dump”
Secondary CTA (optional): “See how it works”
Minimal sections:
Problem framing
How Braindump works (3-step explanation)
Simple Free vs Pro mention (no deep pricing yet)
Trust indicators (privacy-first messaging)
Primary action
Click CTA → Signup/Login screen

1.2 Signup / Login Screen
Purpose
Get the user into the product with as little friction as possible.
Screen description
Email + password input
Optional magic link or OAuth (if implemented)
Short reassurance copy:
Takes less than 3 minutes
No credit card required
Toggle between Signup and Login states
Primary action
Successful authentication → Onboarding flow

2. Onboarding Screens (First-Time User Only)
2.1 Onboarding Screen 1: What This Is
Purpose
Reset expectations and reduce anxiety.
Screen description
Short explanation:
This is not a traditional journaling app
You don’t need to write well
Messy thoughts are welcome
Minimal copy, friendly tone
Primary action
Continue

2.2 Onboarding Screen 2: What Happens Next
Purpose
Explain the product loop clearly.
Screen description
Simple explanation of the flow:
You dump your thoughts
AI analyzes them
You get clarity and a short to-do list
Reinforces simplicity and speed
Primary action
Continue

2.3 Onboarding Screen 3: Psychological Safety
Purpose
Build trust and permission to be honest.
Screen description
Privacy reassurance
Encouragement to write freely
Emphasis on personal, judgment-free space
Primary action
“Start your brain dump” → Brain Dump Screen

3. Core Daily Flow Screens
3.1 Brain Dump Screen (Daily Input)
Purpose
Capture unstructured thoughts with zero friction.
Screen description
Large, distraction-free text input
Placeholder text encouraging free expression
Date indicator (Today)
Autosave behavior (implicit)
Minimal UI chrome
Primary actions
“Get clarity” button
If user leaves, content is saved automatically

3.2 AI Processing Screen (Loading State)
Purpose
Create anticipation and trust in the AI process.
Screen description
Loading indicator
Human, calming copy explaining AI is making sense of thoughts
No progress percentages or technical language
Primary outcome
Automatically transitions to AI Results Screen

3.3 AI Results Screen (Clarity + Tasks)
Purpose
Deliver the core value of the product.
Screen layout (conceptual)
Section 1: Clarity Summary
3–5 short bullet points
Reflective tone
Summarizes key themes and emotional context
Section 2: Today’s To-Do List
List of actionable tasks
Each task is checkable
Tasks are realistic and scoped to the day
Section 3: Gentle Framing
One supportive line reinforcing progress over perfection
Primary actions
Start checking tasks
Exit screen (progress persists)

4. Task Execution & Progress Screens
4.1 Daily Tasks View (Persistent State)
Purpose
Allow users to revisit and complete tasks throughout the day.
Screen description
Displays today’s task list
Tasks can be marked as completed
Completed tasks show clear visual state change
No editing or reordering in Phase I
Primary actions
Mark tasks complete
Return to app multiple times during the day

4.2 End-of-Day Closure Screen
Purpose
Provide emotional closure and reinforce habit formation.
Trigger
All tasks completed OR user revisits app later in the day
Screen description
Summary of completed tasks
Simple positive reinforcement message
No performance metrics or charts
Primary outcome
User leaves the app feeling accomplished

5. Free Plan Limit & Upgrade Screens
5.1 Free Limit Reached Screen
Purpose
Introduce monetization without breaking trust.
Trigger
User attempts to generate AI clarity after exceeding free usage
Screen description
Clear message explaining free limit is reached
Reinforces value they’ve already experienced
Explains what Pro unlocks (briefly)
Primary action
“Upgrade to Pro”

5.2 Pricing & Upgrade Screen
Purpose
Convert engaged users into paying users.
Screen description
Simple comparison:
Free vs Pro
Emphasis on continuity and reflection
Clear pricing:
Monthly and yearly option
No distractions or upsells
Primary action
Confirm upgrade → Payment flow

5.3 Payment Confirmation Screen
Purpose
Confirm successful upgrade and reinforce value.
Screen description
Confirmation message
Clear explanation of what’s now unlocked
Encouragement to continue daily habit
Primary action
Continue to app

6. Weekly Retention Screens (Pro)
6.1 Weekly AI Review Screen
Purpose
Deliver long-term value and retention.
Trigger
End of week for Pro users
Screen description
AI-generated weekly summary including:
Recurring themes
Common worries
Tasks completed
Observed patterns
One improvement suggestion
Calm, reflective tone
Primary actions
Read and reflect
Continue next week with clarity

7. History & Account Screens (Minimal)
7.1 Past Entries & Tasks Screen (Pro Only)
Purpose
Allow users to see continuity over time.
Screen description
List of past days
Each day expandable to show:
Clarity summary
Tasks completed
No filters or analytics in Phase I

7.2 Account / Settings Screen
Purpose
Basic account management.
Screen description
Plan status (Free or Pro)
Upgrade / manage subscription
Logout
Privacy policy and support link

Final Screen Inventory (Phase I)
Landing Page
Signup / Login
Onboarding (3 screens)
Brain Dump
AI Processing
AI Results (Clarity + Tasks)
Daily Tasks View
End-of-Day Closure
Free Limit Reached
Pricing & Upgrade
Payment Confirmation
Weekly AI Review (Pro)
Past Entries (Pro)
Account / Settings

