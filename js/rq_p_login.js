(function (RQ) {
    'use strict';

    RQ.runOnPage.push({
        testPath: (path) => !!path.match(/#\/default$/),
        runScript: goToLogin
    });
    RQ.runOnPage.push({
        testPath: (path) => !!path.match(/#\/login$/),
        runScript: autoLogin
    });

    /**This takes you from the "Sign In to RentalWorks" page (rentalworksweb.com/#/default) to the 
     * actual login page (rentalworksweb.com/#/login) where you enter your username and password.*/
    function goToLogin () {
        let h = location.href;
        const entry = "/default";
        const login = "/login";
        if (h.endsWith(entry)) {
            location.href = h.substring(0, h.length - entry.length) + login;
        }
    }

    /**Attempt an automatic login if presented with the login page. This expects the
     * user to have a password manager that fills out the username and password fields,
     * and then this function submits the login form if it's ready.
     * @returns true if there is no need to attempt autoLogin again (either due to success or error) */
    function autoLogin () {
        // Abort autologin if there is an error message
        let errorDiv = document.querySelector(".errormessage");
        if (errorDiv?.offsetParent) return true;
        // Abort autologin if there is an error popup
        if (document.querySelector(".errorDialog")) return true;

        let loginButton = document.querySelector(".login-button.btnLogin");
        // Check if login button exists and is visible (offsetParent == null implies element is hidden)
        if (loginButton?.offsetParent) {
            let unField = document.querySelector(".login-fields #email");
            let pwField = document.querySelector(".login-fields #password");
            let unLength = unField?.value.length ?? 0;
            let pwLength = pwField?.value.length ?? 0;
            // Chrome password manager doesn't expose autofilled password values to javascript without 
            // user interaction, but we can check for the existence of :autofill pseudo-class.
            let unAutofilled = false;
            let pwAutofilled = false;

            try {
                // Chrome, Edge, and Opera require the -webkit- prefix (April 2023)
                if (/edg|opr|chrome|chromium|crios/i.test(window.navigator.userAgent)) {
                    unAutofilled = !!document.querySelector(".login-fields #email:-webkit-autofill");
                    pwAutofilled = !!document.querySelector(".login-fields #password:-webkit-autofill");
                }
                else {
                    unAutofilled = !!document.querySelector(".login-fields #email:autofill");
                    pwAutofilled = !!document.querySelector(".login-fields #password:autofill");
                }
            }
            catch (error) {
                // Performing querySelector with an invalid pseudo-element results in an error, like:
                //   Uncaught DOMException: Failed to execute 'querySelector' on 'Document': '.login-fields #email:autofill' is not a valid selector.
                console.warn(error);
                // If we catch an error, it is a sign of a browser incompatibility. In that case, return true so that this script isn't run again.
                return true;
            }

            // The expectation is that a password manager will autofill these fields, but we
            // have to make sure not to interrupt the user if they're typing it manually.
            if ((unAutofilled || (unLength > 0 && document.activeElement != unField)) &&
                (pwAutofilled || (pwLength > 0 && document.activeElement != pwField))) {
                // Now is an appropriate moment to attempt auto-login. Make one last check in case the user's first page interaction was to click on 
                // the Sign In button or press Enter. We need to not click the login button if the user does it first. There is a "Please Wait" spinner
                // that pops up just before the first ajax call to log in; this is how we identify whether the login process has already started.
                let getSpinner = () => document.querySelector('.fwoverlay-center.pleasewait');
                if (getSpinner()) {
                    console.log('RentalQuirks auto-login aborted - login initiated by user');
                    // Login is happening due to user interaction. Return true to stop retrying autoLogin().
                    return true;
                }

                console.log('RentalQuirks auto-login');
                loginButton.click();
                // If the click succeeds, a busy spinner will appear. We can use this as evidence of success.
                if (getSpinner()) {
                    // Button was clicked and login is happening. Return true to stop retrying autoLogin().
                    return true;
                }
                // Keep trying until the page changes, because calling click() is ignored until the page has had some user interaction (Chromium behaviour - Firefox works immediately).
                return false;
            }
        }
        return false;
    }
})(window.RentalQuirks);