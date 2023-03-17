(function (RQ) {
    'use strict';

    RQ.runOnPage.push({
        testPath: (path) => !!path.match(/(\/rentalworks\/)?#\/default$/),
        runScript: goToLogin
    });
    RQ.runOnPage.push({
        testPath: (path) => !!path.match(/(\/rentalworks\/)?#\/login$/),
        runScript: autoLogin
    });

    /**This takes you from the "Sign In to RentalWorks" page (rentalworks/#/default) 
     * to the actual login page (rentalworks/#/login) where you enter your username and password.*/
    function goToLogin () {
        let h = location.href;
        const entry = "/default";
        const login = "/login";
        if (h.endsWith(entry)) {
            location.href = h.substr(0, h.length - entry.length) + login;
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

        let loginButton = document.querySelector(".login-button[data-id]");
        // Check if login button exists and is visible (offsetParent == null implies element is hidden)
        if (loginButton?.offsetParent) {
            let unField = document.querySelector(".login-fields #email");
            let pwField = document.querySelector(".login-fields #password");
            let unLength = unField?.value.length ?? 0;
            let pwLength = pwField?.value.length ?? 0;
            // Chrome password manager doesn't expose autofilled password values to javascript without 
            // user interaction, but we can check for the existence of :-webkit-autofill pseudo-class.
            let unAutofilled = !!document.querySelector(".login-fields #email\\:-webkit-autofill, .login-fields #email:-internal-autofill-selected");
            let pwAutofilled = !!document.querySelector(".login-fields #password\\:-webkit-autofill, .login-fields #password:-internal-autofill-selected");

            // The expectation is that a password manager will autofill these fields, but we
            // have to make sure not to interrupt the user if they're typing it manually.
            if ((unAutofilled || (unLength > 0 && document.activeElement != unField)) &&
                (pwAutofilled || (pwLength > 0 && document.activeElement != pwField))) {
                console.log('RentalQuirks auto-login');
                loginButton.click();
                return true;
            }
        }
        return false;
    }
})(window.RentalQuirks);