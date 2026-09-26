const admin = require("firebase-admin");
admin.initializeApp();

async function testFunction() {
  try {
    const testData = {
      email: "test@example.com",
      name: "Test User",
      uid: "test123",
    };
    
    console.log("Calling manualSendWelcomeEmail with data:", testData);
    
    // Get a reference to the function
    const fn = admin.functions().httpsCallable("manualSendWelcomeEmail");
    
    // Call the function
    const result = await fn(testData);
    
    console.log("Function returned:", result.data);
  } catch (error) {
    console.error("Error calling function:", error);
  }
}

testFunction();