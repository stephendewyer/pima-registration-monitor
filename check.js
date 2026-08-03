import fs from "node:fs/promises";
import cheerio from "cheerio";
import sgMail from "@sendgrid/mail";

//
// Configuration
//

const config = {
    programName: "Pima FastTrack Electrical Program",

    url: "https://pima.edu/academics-programs/workforce/pima-fast-track/bct/electrician/index.html",

    searchTerms: {
        term: "spring 2027",
        program: "electrical"
    },

    openPhrases: [
        "registration open",
        "register now",
        "registration is available",
        "enroll now",
        "apply now"
    ]
};


sgMail.setApiKey(process.env.SENDGRID_API_KEY);


async function sendEmail(subject, html) {

    await sgMail.send({
        to: process.env.EMAIL_TO,
        from: process.env.EMAIL_FROM,
        subject,
        html,
        text: html.replace(/<[^>]*>/g, "")
    });

};


async function loadState() {

    try {

        const data = await fs.readFile(
            "./state.json",
            "utf8"
        );

        return JSON.parse(data);

    } catch {

        return {
            registrationOpen: false,
            lastChecked: null
        };

    };

};

async function saveState(state) {

    await fs.writeFile(
        "./state.json",
        JSON.stringify(state, null, 2)
    );

};


function checkIfRegistrationIsOpen(pageText) {

    const termFound = pageText.includes(config.searchTerms.term);

    const programFound = pageText.includes(config.searchTerms.program);

    const matchedOpenPhrases = config.openPhrases.filter(phrase => pageText.includes(phrase));

    return {
        isOpen:
            termFound &&
            programFound &&
            matchedOpenPhrases.length > 0,

        matchedOpenPhrases
    };

};


async function checkRegistration() {

    console.log( `Checking ${config.programName}`);

    //
    // Download page
    //

    const response = await fetch(config.url);

    if (!response.ok) {

        throw new Error(`Unable to fetch page: ${response.status}`);

    };

    const html = await response.text();

    //
    // Extract text
    //

    const $ = cheerio.load(html);


    const pageText = $("main")
        .text()
        .replace(/\s+/g, " ")
        .trim()
        .toLowerCase();

    //
    // Determine registration status
    //

    const result = checkIfRegistrationIsOpen(pageText);

    console.log({
        registrationOpen: result.isOpen,
        matchedPhrases: result.matchedOpenPhrases
    });

    //
    // Compare previous state
    //

    const state = await loadState();

    //
    // Only send notification once
    //

    if (
        !state.registrationOpen &&
        result.isOpen
    ) {

        await sendEmail(
            `${config.programName} Registration Open`,
            `
            <h2>${config.programName}</h2>

            <p>
            Registration appears to be open.
            </p>

            <p>
            Detected phrases:
            </p>

            <ul>
                ${
                    result.matchedOpenPhrases
                        .map(
                            phrase =>
                            `<li>${phrase}</li>`
                        )
                        .join("")
                }
            </ul>

            <p>
                <a href="${config.url}">
                    View Registration Page
                </a>
            </p>
            `
        );

        console.log("Notification sent.");

    } else {

        console.log("No notification needed.");

    };


    //
    // Save current state
    //

    await saveState({

        registrationOpen:
            result.isOpen,

        lastChecked:
            new Date().toISOString()

    });

};


checkRegistration()
    .catch(error => {

        console.error(error);

        process.exit(1);

    });