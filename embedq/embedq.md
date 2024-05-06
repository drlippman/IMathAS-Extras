# IMathAS Embeddable Questions: Embedq2


## Practice Mode
This allows embedding practice problems in any website, without any authorization requirements.  No scores are passed back.

### Setup
Create an iframe, styled like this:
```
<div id="embed1wrap" style="overflow:visible;position:relative">
 <iframe id="embed1" style="position:absolute;z-index:1" frameborder=0 src="hostsite.com/embedq2.php?id=123&frame_id=embed1"></iframe>
</div>
```

If there are multiple embeds on one page, and there's a possibility the mathquill 
palette from the first could overlap the second quesiton, you'll need to adjust 
the z-index values so that the questions higher in the page have higher z-indexes.

Setup your iframe with the following query string parameters:
* `id` (required):  IMathAS question ID
* `frame_id` (recommended): The ID of the iframe
* `theme` (optional):  A theme name (without the .css) to use in place of the system default.
* `showscoredonsubmit` (optional; default 1): Set to 0 if you don’t want the question to re-display scored after it’s submitted.
* `maxtries` (optional; default 0): Set to more than 0 to set the max tries on a question part before it gets disabled, and before a scaffolded question will move on to the next part.
* `showansafter` (optional: default 1, or maxtries if set): Set to have the answer show after this many tries.  Set to 0 to have answers never show.
* `showhints` (optional; default 3): Set to 0 to suppress help features, like hints and video buttons.
* `allowregen` (optional; default 1): When jssubmit is 0 and showscoredonsubmit is 1, setting this to 1 will show a "Try another version" button after submitting
* `submitall` (optional; default 0): Set to 1 for all parts to get submitted, regardless of whether all parts are answered.
* `jssubmit` (optional; default 0):  Set to 1 to suppress the built-in "Submit" button.  You will have to trigger the submit via postMessage (see below)
* `showans` (optional; default 0): Set to 1 if you want to force the answers to show.
* `seed` (optional; default random): To set a specific seed (1-9999)

### Submitting

If using `jssubmit=1`, to submit the question send a postMessage to the iframe with the message "submit".

### Listening

Ideally the embedding system should implement a postMessage listener, that can handle these messages:

Resize.  
* MyOpenMath will send a stringified JSON with elements:
  * `subject`: `lti.frameResize`
  * `height`:  a number of pixels for the iframe height
  * `wrap_height`: a number of pixels for the iframe wrapper
  * `frame_id`:  the frame_id passed in the query string
* On receiving this message, the embedding system should adjust the height on the specified iframe and associated wrapper to the specified pixel height.


### Change Question or Redisplay

To change the question without reloading the iframe completely, send a postMessage to the iframe with a JSON-stringified object with:
* `subject`: `imathas.show`
* `id`: the ID for the new question

### For multiple questions

If you have multiple questions you want to display at the same time, rather than
create multiple iframes, change the iframe src to `multiembedq2.php` and for 
the `id` put a dash-separated list of question IDs.  Most of the other parameters
available for embedq2 are available for multiembedq2 as well.

Multiembedq2 only works in practice mode, not in scored mode.


## Scored Mode
This allows embedding problems in a website with scores passed back to the embedding page.  
This requires an authorization key/secret.
You can generate this in your own IMathAS system using LTI Provider Creds from the Admin page.

MyOpenMath provides scored embeds as a hosted service, which requires a payment
agreement.  Contact sales@myopenmath.com for details.  

### Setup

Generate a [JWT](https://jwt.io/) with payload parameters.  For default use, include:
* `id` (required):  MyOpenMath question ID
* `auth` (required):  Your developer authentication key. 

You can optionally alter the behavior using these optional parameters:
* `seed` (optional; default random): To set a specific seed (1-9999)
* `jssubmit` (optional; default 1):  Set to 0 if you want MOM to display its own Submit button. If set to 1, IMathAS will not display a Submit button, and you’ll have trigger a submit via javascript (see below)
* `showscoredonsubmit` (optional; default 0): Set to 1 if you want the question to re-display scored after it’s submitted.
* `maxtries` (optional; default 0): Set to more than 0 to set the max tries on a question part before it gets disabled, and before a scaffolded question will move on to the next part.
* `showansafter` (optional: default 0, or maxtries if set): Set to have the answer show after this many tries.  Set to 0 to have answers never show.
* `showans` (optional; default 0): Set to 1 to force answers to show.
* `includeans` (optional; default 0): Set to 1 to include the answer and detailed soln (if used) in
  the returned JSON. Note that this will include the answers regardless of the showans option or showansafter status,
  so use with caution to avoid revealing the answers in the transmission.
* `showhints` (optional; default 3): Set to 0 to suppress help features, like hints and video buttons.
* `allowregen` (optional; default 0): When jssubmit is 0 and showscoredonsubmit is 1, setting this to 1 will show a "Try another version" button after submitting.  Generally in scored mode the embedding site would handle generating new versions instead.
* `submitall` (optional; default 1): Set to 1 for all parts to get submitted, regardless of whether all parts are answered.  Note that scaffolded questions will never be able to be submitted all at once.
* `autoseq` (optional; default 1): Set to 0 for scaffolded questions to not automatically display the next part after submitting the previous part.

You can also set a11y prefs in the JWT, by setting the keys:
* `mathdisp`
* `graphdisp`
* `drawentry`
* `useed`
* `livepreview`

Sign the JWT with the corresponding authentication secret.

Create an iframe with src https://hostsite.com/embedq2.php with query string parameters:
* `jwt`, or the individual parameters above (required):  The JWT generated per above
* `frame_id` (recommendedl):  The html ID of the iframe.  Used to identify the source frame in postMessages.  If not specified, defaults to "embedq2-###", where ### is the question ID.
* `theme` (optional):  A theme name (without the .css) to use in place of the system default.


Wrap the iframe and style like this:
```
<div id="embed1wrap" style="overflow:visible;position:relative">
 <iframe id="embed1" style="position:absolute;z-index:1" frameborder=0 src="hostsite.com/embedq2.php?jwt=...&frame_id=embed1"></iframe>
</div>
```

If there are multiple embeds on one page, and there's a possibility the mathquill 
palette from the first could overlap the second quesiton, you'll need to adjust 
the z-index values so that the questions higher in the page have higher z-indexes.

### Submitting
If using `jssubmit=1` (the default), to submit the question send a postMessage to the iframe with the message "submit".

### Listening
The embedding system should implement a postMessage listener, that can handle these messages:

* Resize.  
   * MyOpenMath will send a stringified JSON with elements:
      * `subject`: `lti.frameResize`
      * `height`:  a number of pixels for the iframe height
      * `wrap_height`: a number of pixels for the iframe wrapper
      * `frame_id`:  the frame_id passed in the query string
   * On receiving this message, the embedding system should adjust the height on the specified iframe and associated wrapper to the specified pixel height.
* After submit.  
   * MyOpenMath will send a stringified JSON with elements:
      * `subject`: `lti.ext.imathas.result`
      * `jwt`: A JWT (signed with the auth secret) containing:
         * `id`: the MyOpenMath question id
         * `score`: the score on the question (float, 0 to 1)
         * `raw`: an array of raw scores on the question parts
         * `allans`: boolean, indicating whether all parts have been answered.  Even if submitall is used, scaffolded questions still submit in chunks.
         * `errors`: an array of error strings generated by the question
         * `state`: a JWT string containing the info necessary for MyOpenMath to redisplay the scored question.  
      * `frame_id`: the frame_id passed in the query string
   * On receiving this message, typically the embedding system will pass the result to their backend, storing the id, score, and state string.


### Redisplay
To redisplay the scored question, create an iframe like for initial display, but add to the JWT one of:
* `showscored`: the redisplay string provided by MyOpenMath.  Shows score markers on parts unless overwritten.
   * `showans` (optional; default 0): 1 to display the answer
* `redisplay`: the redisplay string provided by MyOpenMath.  Does not show score markers on parts unless overwritten.


### Change Question or Redisplay
To change the question, or to redisplay without completely reloading the iframe, send a postMessage to the iframe with a JSON-stringified object with:
* `subject`: `imathas.show`
* `jwt`: for auth cases, the JWT for the new question/redisplay.

### Considerations

For most basic questions, the default display options will work fine.
In the default, all parts of a multipart questions are submitted together,
and the embedding system's logic can decide whether to redisplay questions
to give another try (using the `redisplay` option), generate a new version
of the question (by initializing the question again without a `redisplay` 
string), etc.

However scaffolded questions (sequential multipart) cannot have all parts
submitted at once.  The `allans` value in the results JWT is a boolean 
indicating whether all parts have been attempted.  In the default display,
students will enter the answer for the first set of inputs, then after
submitting will be reshown the question and have an opportunity to complete
the next set of inputs.  To change this behavior, you can can use the
`showscoredonsubmit` and `maxtries` options, along with other options, to
automatically show the answer scored and allow multiple tries before moving
on to the next set of inputs.  Or you can set `autoseq=0` to disable
the auto progression and control it yourself using `showscored`.