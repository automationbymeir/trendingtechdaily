//workflows.js
const functions = require("firebase-functions");
const admin = require("./admin"); // Import the initialized admin SDK
const db = require("./db"); // Import the initialized Firestore instance
// Create or update a workflow
exports.saveWorkflow = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage workflows.",
    );
  }
  
  try {
    const { id, name, trigger, steps, status } = data;
    
    // Validate required fields
    if (!name || !trigger || !steps || steps.length === 0) {
      throw new functions.https.HttpsError(
        "invalid-argument",
        "Missing required workflow fields",
      );
    }
    
    // Workflow data
    const workflowData = {
      name,
      trigger,
      steps,
      status: status || "draft",
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    
    let workflowId = id;
    
    if (workflowId) {
      // Update existing workflow
      await db.collection("workflows").doc(workflowId).update(workflowData);
    } else {
      // Create new workflow
      workflowData.createdAt = admin.firestore.FieldValue.serverTimestamp();
      
      const docRef = await db.collection("workflows").add(workflowData);
      workflowId = docRef.id;
    }
    
    return { success: true, workflowId };
  } catch (error) {
    console.error("Error saving workflow:", error);
    throw new functions.https.HttpsError("internal", "Failed to save workflow");
  }
});

// Get all workflows
exports.getWorkflows = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access workflows.",
    );
  }
  
  try {
    const workflowsSnapshot = await db.collection("workflows")
      .orderBy("createdAt", "desc")
      .get();
    
    const workflows = [];
    
    workflowsSnapshot.forEach(doc => {
      workflows.push({
        id: doc.id,
        ...doc.data(),
      });
    });
    
    return { workflows };
  } catch (error) {
    console.error("Error getting workflows:", error);
    throw new functions.https.HttpsError("internal", "Failed to get workflows");
  }
});

// Get a specific workflow
exports.getWorkflow = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to access workflows.",
    );
  }
  
  try {
    const { workflowId } = data;
    
    if (!workflowId) {
      throw new functions.https.HttpsError("invalid-argument", "Workflow ID is required");
    }
    
    const workflowDoc = await db.collection("workflows").doc(workflowId).get();
    
    if (!workflowDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Workflow not found");
    }
    
    const workflow = {
      id: workflowDoc.id,
      ...workflowDoc.data(),
    };
    
    // Get execution stats
    const executionsSnapshot = await db.collection("workflows")
      .doc(workflowId)
      .collection("executions")
      .orderBy("startedAt", "desc")
      .limit(100)
      .get();
    
    const executions = [];
    let activeCount = 0;
    let completedCount = 0;
    let errorCount = 0;
    
    executionsSnapshot.forEach(doc => {
      const execution = doc.data();
      executions.push({
        id: doc.id,
        ...execution,
      });
        
      // Count by status
      if (execution.status === "processing") {
        activeCount++;
      } else if (execution.status === "completed") {
        completedCount++;
      } else if (execution.status === "error") {
        errorCount++;
      }
    });
      
    // Add execution stats to the workflow
    workflow.stats = {
      active: activeCount,
      completed: completedCount,
      error: errorCount,
      total: executionsSnapshot.size,
    };
      
    workflow.executions = executions.slice(0, 10); // Only return the most recent executions
      
    return workflow;
  } catch (error) {
    console.error("Error getting workflow:", error);
    throw new functions.https.HttpsError("internal", "Failed to get workflow");
  }
});
  
// Toggle workflow status (activate/pause)
exports.toggleWorkflowStatus = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage workflows.",
    );
  }
    
  try {
    const { workflowId } = data;
      
    if (!workflowId) {
      throw new functions.https.HttpsError("invalid-argument", "Workflow ID is required");
    }
      
    // Get the workflow
    const workflowDoc = await db.collection("workflows").doc(workflowId).get();
      
    if (!workflowDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Workflow not found");
    }
      
    const workflow = workflowDoc.data();
      
    // Toggle status
    const newStatus = workflow.status === "active" ? "paused" : "active";
      
    await db.collection("workflows").doc(workflowId).update({
      status: newStatus,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
      
    return { success: true, status: newStatus };
  } catch (error) {
    console.error("Error toggling workflow status:", error);
    throw new functions.https.HttpsError("internal", "Failed to toggle workflow status");
  }
});
  
// Delete a workflow
exports.deleteWorkflow = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to manage workflows.",
    );
  }
    
  try {
    const { workflowId } = data;
      
    if (!workflowId) {
      throw new functions.https.HttpsError("invalid-argument", "Workflow ID is required");
    }
      
    // Get the workflow
    const workflowDoc = await db.collection("workflows").doc(workflowId).get();
      
    if (!workflowDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Workflow not found");
    }
      
    // Check for active executions
    const activeExecutionsSnapshot = await db.collection("workflows")
      .doc(workflowId)
      .collection("executions")
      .where("status", "==", "processing")
      .limit(1)
      .get();
      
    if (!activeExecutionsSnapshot.empty) {
      throw new functions.https.HttpsError(
        "failed-precondition",
        "Workflow has active executions and cannot be deleted",
      );
    }
      
    // Delete all executions
    const executionsSnapshot = await db.collection("workflows")
      .doc(workflowId)
      .collection("executions")
      .get();
      
    const batch = db.batch();
    const batchSize = 500; // Firestore batch limit
    let batchCount = 0;
    let currentBatch = db.batch();
      
    executionsSnapshot.forEach(doc => {
      currentBatch.delete(doc.ref);
      batchCount++;
        
      if (batchCount >= batchSize) {
        // Commit batch and start a new one
        batch.commit();
        currentBatch = db.batch();
        batchCount = 0;
      }
    });
      
    // Commit final batch if needed
    if (batchCount > 0) {
      await currentBatch.commit();
    }
      
    // Delete the workflow
    await db.collection("workflows").doc(workflowId).delete();
      
    return { success: true };
  } catch (error) {
    console.error("Error deleting workflow:", error);
    throw new functions.https.HttpsError("internal", "Failed to delete workflow");
  }
});
  
// Trigger workflow for a user
exports.triggerWorkflow = functions.https.onCall(async (data, context) => {
  // Verify authentication
  if (!context.auth) {
    throw new functions.https.HttpsError(
      "unauthenticated",
      "You must be logged in to trigger workflows.",
    );
  }
    
  try {
    const { workflowId, subscriberId } = data;
      
    if (!workflowId) {
      throw new functions.https.HttpsError("invalid-argument", "Workflow ID is required");
    }
      
    if (!subscriberId) {
      throw new functions.https.HttpsError("invalid-argument", "Subscriber ID is required");
    }
      
    // Get the workflow
    const workflowDoc = await db.collection("workflows").doc(workflowId).get();
      
    if (!workflowDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Workflow not found");
    }
      
    const workflow = workflowDoc.data();
      
    // Get the subscriber
    const subscriberDoc = await db.collection("subscribers").doc(subscriberId).get();
      
    if (!subscriberDoc.exists) {
      throw new functions.https.HttpsError("not-found", "Subscriber not found");
    }
      
    // Create workflow execution
    const executionRef = await db.collection("workflows")
      .doc(workflowId)
      .collection("executions")
      .add({
        workflowId: workflowId,
        subscriberId: subscriberId,
        status: "processing",
        currentStep: 0,
        startedAt: admin.firestore.FieldValue.serverTimestamp(),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      });
      
    // Process the first step
    await processWorkflowStep(workflow, workflow.steps[0], subscriberId, executionRef.id);
      
    return { success: true, executionId: executionRef.id };
  } catch (error) {
    console.error("Error triggering workflow:", error);
    throw new functions.https.HttpsError("internal", "Failed to trigger workflow");
  }
});
  
// Process user registration trigger
exports.processNewRegistration = functions.https.onRequest(async (req, res) => {
  try {
    // Extract subscriberId from the request
    const subscriberId = req.query.subscriberId;
    
    if (!subscriberId) {
      return res.status(400).send("Missing subscriberId parameter");
    }
    
    // Get subscriber data
    const subscriberDoc = await db.collection("subscribers").doc(subscriberId).get();
    
    if (!subscriberDoc.exists) {
      return res.status(404).send("Subscriber not found");
    }
    
    const subscriber = subscriberDoc.data();
    
    // Find workflows with new_registration trigger
    const workflowsSnapshot = await db.collection("workflows")
      .where("trigger", "==", "new_registration")
      .where("status", "==", "active")
      .get();
    
    if (workflowsSnapshot.empty) {
      return res.status(200).send("No applicable workflows found");
    }
    
    // Start each workflow
    const promises = [];
    
    workflowsSnapshot.forEach(doc => {
      const workflow = doc.data();
      const workflowId = doc.id;
      
      promises.push(
        db.collection("workflows")
          .doc(workflowId)
          .collection("executions")
          .add({
            workflowId: workflowId,
            subscriberId: subscriberId,
            status: "processing",
            currentStep: 0,
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          })
          .then(executionRef => {
            return processWorkflowStep(workflow, workflow.steps[0], subscriberId, executionRef.id);
          }),
      );
    });
    
    await Promise.all(promises);
    res.status(200).send("Workflows started successfully");
  } catch (error) {
    console.error("Error processing new registration:", error);
    res.status(500).send(`Error: ${error.message}`);
  }
});

// Process list subscription trigger
exports.processListSubscription = functions.https.onRequest(async (req, res) => {
  try {
    // Extract parameters from the request
    const listId = req.query.listId;
    const subscriberId = req.query.subscriberId;
    
    if (!listId || !subscriberId) {
      return res.status(400).send("Missing listId or subscriberId parameters");
    }
    
    // Find workflows with list_subscription trigger
    const workflowsSnapshot = await db.collection("workflows")
      .where("trigger", "==", "list_subscription")
      .where("status", "==", "active")
      .get();
    
    if (workflowsSnapshot.empty) {
      return res.status(200).send("No applicable workflows found");
    }
    
    // Start each workflow
    const promises = [];
    
    workflowsSnapshot.forEach(doc => {
      const workflow = doc.data();
      const workflowId = doc.id;
      
      // Check if this workflow applies to this list
      if (workflow.listId && workflow.listId !== listId) {
        return;
      }
      
      promises.push(
        db.collection("workflows")
          .doc(workflowId)
          .collection("executions")
          .add({
            workflowId: workflowId,
            subscriberId: subscriberId,
            listId: listId,
            status: "processing",
            currentStep: 0,
            startedAt: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
          })
          .then(executionRef => {
            return processWorkflowStep(workflow, workflow.steps[0], subscriberId, executionRef.id);
          }),
      );
    });
    
    await Promise.all(promises);
    res.status(200).send("Workflows started successfully");
  } catch (error) {
    console.error("Error processing list subscription:", error);
    res.status(500).send(`Error: ${error.message}`);
  }
});
  
/// Process workflow execution - CHANGED TO HTTP FUNCTION
exports.processWorkflowExecution = functions.https.onRequest(async (req, res) => {
  try {
    // Get active executions that need to move to the next step
    const now = admin.firestore.Timestamp.now();
    
    // Get scheduled tasks
    const tasksSnapshot = await db.collection("scheduledTasks")
      .where("taskType", "==", "workflow_execution")
      .where("scheduledFor", "<=", now)
      .limit(100) // Process in batches
      .get();
    
    if (tasksSnapshot.empty) {
      res.status(200).send("No workflow tasks to process");
      return;
    }
    
    console.log(`Processing ${tasksSnapshot.size} workflow tasks`);
    
    // Process each task
    const promises = [];
    
    for (const taskDoc of tasksSnapshot.docs) {
      const task = taskDoc.data();
      const { workflowId, executionId, subscriberId } = task;
      
      // Get the workflow
      const workflowDoc = await db.collection("workflows").doc(workflowId).get();
      
      if (!workflowDoc.exists) {
        console.log(`Workflow not found: ${workflowId}`);
        await taskDoc.ref.delete();
        continue;
      }
      
      const workflow = workflowDoc.data();
      
      // Get the execution
      const executionDoc = await db.collection("workflows")
        .doc(workflowId)
        .collection("executions")
        .doc(executionId)
        .get();
      
      if (!executionDoc.exists) {
        console.log(`Execution not found: ${executionId}`);
        await taskDoc.ref.delete();
        continue;
      }
      
      const execution = executionDoc.data();
      
      // Check if execution is still processing
      if (execution.status !== "processing") {
        console.log(`Execution is not active: ${executionId}`);
        await taskDoc.ref.delete();
        continue;
      }
      
      // Get the current step
      const step = workflow.steps[execution.currentStep];
      
      if (!step) {
        console.log(`Step not found: ${execution.currentStep}`);
        await taskDoc.ref.delete();
        continue;
      }
      
      // Process the step
      promises.push(
        processWorkflowStep(workflow, step, subscriberId, executionId)
          .then(() => {
            // Move to next step
            return db.collection("workflows")
              .doc(workflowId)
              .collection("executions")
              .doc(executionId)
              .update({
                currentStep: execution.currentStep + 1,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              });
          })
          .then(() => {
            // Check if we're done with the workflow
            if (execution.currentStep + 1 >= workflow.steps.length) {
              return db.collection("workflows")
                .doc(workflowId)
                .collection("executions")
                .doc(executionId)
                .update({
                  status: "completed",
                  completedAt: admin.firestore.FieldValue.serverTimestamp(),
                });
            } else {
              // Schedule the next step if needed
              const nextStep = workflow.steps[execution.currentStep + 1];
              
              if (nextStep.delay && nextStep.delay > 0) {
                const nextExecutionTime = new Date();
                nextExecutionTime.setSeconds(nextExecutionTime.getSeconds() + nextStep.delay);
                
                return db.collection("scheduledTasks").add({
                  taskType: "workflow_execution",
                  workflowId: workflowId,
                  executionId: executionId,
                  subscriberId: subscriberId,
                  scheduledFor: admin.firestore.Timestamp.fromDate(nextExecutionTime),
                });
              }
              
              // No delay, process next step immediately
              return processWorkflowStep(
                workflow, 
                nextStep, 
                subscriberId, 
                executionId,
              ).then(() => {
                // Update execution
                return db.collection("workflows")
                  .doc(workflowId)
                  .collection("executions")
                  .doc(executionId)
                  .update({
                    currentStep: execution.currentStep + 2,
                    lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
                  });
              }).then(() => {
                // Check if we're done with the workflow
                if (execution.currentStep + 2 >= workflow.steps.length) {
                  return db.collection("workflows")
                    .doc(workflowId)
                    .collection("executions")
                    .doc(executionId)
                    .update({
                      status: "completed",
                      completedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }
              });
            }
          })
          .then(() => {
            // Delete the task
            return taskDoc.ref.delete();
          })
          .catch(error => {
            console.error(`Error processing workflow step: ${error}`);
            
            // Mark execution as error
            return db.collection("workflows")
              .doc(workflowId)
              .collection("executions")
              .doc(executionId)
              .update({
                status: "error",
                error: error.message,
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
              }).then(() => {
                // Delete the task
                return taskDoc.ref.delete();
              });
          }),
      );
    }
    
    await Promise.all(promises);
    res.status(200).send("Workflow processing complete");
  } catch (error) {
    console.error("Error processing workflow executions:", error);
    res.status(500).send(`Error processing workflows: ${error.message}`);
  }
});
// Process a workflow step
async function processWorkflowStep(workflow, step, subscriberId, executionId) {
  try {
    // Get the subscriber
    const subscriberDoc = await db.collection("subscribers").doc(subscriberId).get();
      
    if (!subscriberDoc.exists) {
      throw new Error(`Subscriber not found: ${subscriberId}`);
    }
      
    const subscriber = subscriberDoc.data();
      
    // Check step condition if present
    if (step.condition) {
      const conditionMet = await checkStepCondition(step.condition, subscriberId, executionId, workflow.id);
        
      if (!conditionMet) {
        console.log(`Condition not met for workflow step: ${step.id}`);
        return; // Skip this step
      }
    }
      
    // Process the step based on its type
    switch (step.type) {
    case "send_email":
      await sendWorkflowEmail(step, subscriber, workflow.id, executionId);
      break;
          
    case "add_tag":
      await db.collection("subscribers").doc(subscriberId).update({
        tags: admin.firestore.FieldValue.arrayUnion(step.tag),
      });
      break;
          
    case "remove_tag":
      await db.collection("subscribers").doc(subscriberId).update({
        tags: admin.firestore.FieldValue.arrayRemove(step.tag),
      });
      break;
          
    case "add_to_list":
      await addSubscriberToList(subscriberId, step.listId);
      break;
          
    case "remove_from_list":
      await removeSubscriberFromList(subscriberId, step.listId);
      break;
          
    case "update_custom_field":
      await db.collection("subscribers").doc(subscriberId).update({
        [`customFields.${step.fieldName}`]: step.fieldValue,
      });
      break;
          
    default:
      throw new Error(`Unknown step type: ${step.type}`);
    }
      
    // Log step completion
    await db.collection("workflows")
      .doc(workflow.id)
      .collection("executions")
      .doc(executionId)
      .collection("steps")
      .doc(step.id)
      .set({
        stepId: step.id,
        type: step.type,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
        status: "completed",
      });
  } catch (error) {
    console.error(`Error processing workflow step ${step.id}:`, error);
    throw error;
  }
}
  
// Send an email as part of a workflow
async function sendWorkflowEmail(step, subscriber, workflowId, executionId) {
  // Get template
  const templateDoc = await db.collection("templates").doc(step.templateId).get();
    
  if (!templateDoc.exists) {
    throw new Error(`Template not found: ${step.templateId}`);
  }
    
  const template = templateDoc.data();
    
  // Generate tracking ID
  const trackingId = `wf_${workflowId}_${executionId}_${step.id}_${Date.now()}`;
    
  // Replace placeholders in subject and content
  const replacements = {
    name: subscriber.name || "",
    email: subscriber.email,
    unsubscribe_url: `https://trendingtechdaily.com/unsubscribe?email=${encodeURIComponent(subscriber.email)}`,
    ...subscriber.customFields,
  };
    
  let subject = template.subject;
  let htmlContent = template.htmlContent;
    
  // Replace placeholders
  for (const [key, value] of Object.entries(replacements)) {
    const regex = new RegExp(`{{${key}}}`, "g");
    subject = subject.replace(regex, value);
    htmlContent = htmlContent.replace(regex, value);
  }
    
  // Add tracking
  const trackingPixel = `<img src="https://us-central1-your-project-id.cloudfunctions.net/emailTracking-trackOpen?tid=${trackingId}" width="1" height="1" alt="" style="display:none;">`;
  htmlContent = htmlContent.replace("</body>", `${trackingPixel}</body>`);
    
  // Add link tracking
  const linkRegex = /<a\s+(?:[^>]*?\s+)?href=(["'])(.*?)\1/g;
    
  htmlContent = htmlContent.replace(linkRegex, (match, quote, url) => {
    // Skip if already a tracking link
    if (url.includes("trackClick") || url.startsWith("mailto:")) {
      return match;
    }
      
    const trackingUrl = `https://us-central1-your-project-id.cloudfunctions.net/emailTracking-trackClick?tid=${trackingId}&url=${encodeURIComponent(url)}`;
    return `<a href=${quote}${trackingUrl}${quote}`;
  });
    
  // Create tracking record
  await db.collection("tracking").doc(trackingId).set({
    trackingId: trackingId,
    workflowId: workflowId,
    executionId: executionId,
    stepId: step.id,
    subscriberId: subscriber.id,
    status: "queued",
    queuedAt: admin.firestore.FieldValue.serverTimestamp(),
  });
    
  // Add to email task queue
  await db.collection("emailTasks").add({
    taskType: "send_email",
    trackingId: trackingId,
    to: subscriber.email,
    subject: subject,
    html: htmlContent,
    from: "TrendingTechDaily <info@trendingtechdaily.com>",
    status: "pending",
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
}
  
// Check if a workflow step condition is met
async function checkStepCondition(condition, subscriberId, executionId, workflowId) {
  switch (condition) {
  case "previous_email_opened": {
    // Get the execution
    const executionDoc = await db.collection("workflows")
      .doc(workflowId)
      .collection("executions")
      .doc(executionId)
      .get();
        
    if (!executionDoc.exists) {
      return false;
    }
        
    const execution = executionDoc.data();
    const previousStepIndex = execution.currentStep - 1;
        
    if (previousStepIndex < 0) {
      return false;
    }
        
    // Get the workflow to find the previous step
    const workflowDoc = await db.collection("workflows").doc(workflowId).get();
        
    if (!workflowDoc.exists) {
      return false;
    }
        
    const workflow = workflowDoc.data();
    const previousStep = workflow.steps[previousStepIndex];
        
    if (previousStep.type !== "send_email") {
      return false;
    }
        
    // Check if the previous email was opened
    const stepsSnapshot = await db.collection("workflows")
      .doc(workflowId)
      .collection("executions")
      .doc(executionId)
      .collection("steps")
      .doc(previousStep.id)
      .get();
        
    if (!stepsSnapshot.exists) {
      return false;
    }
        
    // Find the tracking ID from the previous step
    const trackingSnapshot = await db.collection("tracking")
      .where("workflowId", "==", workflowId)
      .where("executionId", "==", executionId)
      .where("stepId", "==", previousStep.id)
      .limit(1)
      .get();
        
    if (trackingSnapshot.empty) {
      return false;
    }
        
    const tracking = trackingSnapshot.docs[0].data();
    return tracking.openedAt != null;
  }
      
  case "previous_email_clicked": {
    // Similar to previous_email_opened but check for clickedAt
    const executionDoc = await db.collection("workflows")
      .doc(workflowId)
      .collection("executions")
      .doc(executionId)
      .get();
        
    if (!executionDoc.exists) {
      return false;
    }
        
    const execution = executionDoc.data();
    const previousStepIndex = execution.currentStep - 1;
        
    if (previousStepIndex < 0) {
      return false;
    }
        
    const workflowDoc = await db.collection("workflows").doc(workflowId).get();
        
    if (!workflowDoc.exists) {
      return false;
    }
        
    const workflow = workflowDoc.data();
    const previousStep = workflow.steps[previousStepIndex];
        
    if (previousStep.type !== "send_email") {
      return false;
    }
        
    const trackingSnapshot = await db.collection("tracking")
      .where("workflowId", "==", workflowId)
      .where("executionId", "==", executionId)
      .where("stepId", "==", previousStep.id)
      .limit(1)
      .get();
        
    if (trackingSnapshot.empty) {
      return false;
    }
        
    const tracking = trackingSnapshot.docs[0].data();
    return tracking.clickedAt != null;
  }
      
  case "has_tag": {
    // Check if subscriber has a specific tag
    const subscriberDoc = await db.collection("subscribers").doc(subscriberId).get();
        
    if (!subscriberDoc.exists) {
      return false;
    }
        
    const subscriber = subscriberDoc.data();
    return subscriber.tags && subscriber.tags.includes(condition.tag);
  }
      
  case "in_list": {
    // Check if subscriber is in a specific list
    const membershipDoc = await db.collection("lists")
      .doc(condition.listId)
      .collection("members")
      .doc(subscriberId)
      .get();
        
    return membershipDoc.exists;
  }
      
  default:
    console.warn(`Unknown condition: ${condition}`);
    return false;
  }
}
  
// Add a subscriber to a list
async function addSubscriberToList(subscriberId, listId) {
  // Check if already in list
  const membershipDoc = await db.collection("lists")
    .doc(listId)
    .collection("members")
    .doc(subscriberId)
    .get();
    
  if (membershipDoc.exists) {
    return; // Already a member
  }
    
  // Add to list
  await db.collection("lists")
    .doc(listId)
    .collection("members")
    .doc(subscriberId)
    .set({
      subscriberId: subscriberId,
      addedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    
  // Update list count
  await db.collection("lists").doc(listId).update({
    subscriberCount: admin.firestore.FieldValue.increment(1),
  });
    
  // Update subscriber's lists
  await db.collection("subscribers").doc(subscriberId).update({
    listIds: admin.firestore.FieldValue.arrayUnion(listId),
  });
}
  
// Remove a subscriber from a list
async function removeSubscriberFromList(subscriberId, listId) {
  // Check if in list
  const membershipDoc = await db.collection("lists")
    .doc(listId)
    .collection("members")
    .doc(subscriberId)
    .get();
    
  if (!membershipDoc.exists) {
    return; // Not a member
  }
    
  // Remove from list
  await db.collection("lists")
    .doc(listId)
    .collection("members")
    .doc(subscriberId)
    .delete();
    
  // Update list count
  await db.collection("lists").doc(listId).update({
    subscriberCount: admin.firestore.FieldValue.increment(-1),
  });
    
  // Update subscriber's lists
  await db.collection("subscribers").doc(subscriberId).update({
    listIds: admin.firestore.FieldValue.arrayRemove(listId),
  });
}