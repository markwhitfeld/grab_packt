require('dotenv').load({
    path: __dirname + '/.env'
});

var request = require('request');
var cheerio = require('cheerio');
var loginDetails = {
    email: process.env.PACKT_EMAIL,
    password: process.env.PACKT_PASSWORD,
    op: "Login",
    form_id: "packt_user_login_form",
    form_build_id: ""
};
var url = 'https://www.packtpub.com/packt/offers/free-learning';
var loginError = 'Sorry, you entered an invalid email address and password combination.';
var getBookUrl;
var bookTitle;

//we need cookies for that, therefore let's turn JAR on
request = request.defaults({
    jar: true
});

console.log('----------- Packt Grab Started -----------');
request(url, function(err, res, body) {
    if (err) {
        console.error('Request failed');
        console.log('----------- Packt Grab Done --------------');
        return;
    }

    var $ = cheerio.load(body);    
    getBookUrl = $("a.twelve-days-claim").attr("href");
    bookTitle = $(".dotd-title").text().trim();
    var bookDetails = createBookDetails(bookTitle, getBookUrl)
    var newFormId = $("input[type='hidden'][id^=form][value^=form]").val();

    if (newFormId) {
        loginDetails.form_build_id = newFormId;
    }

    request.post({
        uri: url,
        headers: {
            'content-type': 'application/x-www-form-urlencoded'
        },
        body: require('querystring').stringify(loginDetails)
    }, function(err, res, body) {
        if (err) {
            console.error('Login failed');
            console.log('----------- Packt Grab Done --------------');
            return;
        };
        var $ = cheerio.load(body);
        var loginFailed = $("div.error:contains('"+loginError+"')");
        if (loginFailed.length) {
            console.error('Login failed, please check your email address and password');
            console.log('Login failed, please check your email address and password');
            console.log('----------- Packt Grab Done --------------');
            return;
        }

        request('https://www.packtpub.com' + getBookUrl, function(err, res, body) {
            if (err) {
                console.error('Request Error');
                console.log('----------- Packt Grab Done --------------');
                return;
            }

            var $ = cheerio.load(body);

            console.log('Book Title: ' + bookTitle);
            console.log('Claim URL: https://www.packtpub.com' + getBookUrl);
            console.log('----------- Packt Grab Done --------------');

            downloadBookFiles(bookDetails)
        });
    });
});

var pushBulletDetails = {
    apiKey: process.env.PUSHBULLET_API_KEY,
    target: process.env.PUSHBULLET_TARGET
};

function createBookDetails(bookTitle, getBookUrl){
    var baseUrl = 'https://www.packtpub.com';
    // getBookUrl sample = '/freelearning-claim/18940/21478'
    // Sample Download Urls
    //'https://www.packtpub.com/ebook_download/18940/pdf'
    //'https://www.packtpub.com/ebook_download/18940/epub'
    //'https://www.packtpub.com/ebook_download/18940/mobi'
    //'https://www.packtpub.com/code_download/19957' // Can't build this url
    var bookId = getBookUrl.replace('/freelearning-claim/','')
        .replace('/21478','');
    
    
    return {
        title: bookTitle,
        claimUrl: baseUrl + getBookUrl,
        bookId: bookId,
        pdfUrl: baseUrl + '/ebook_download/' + bookId + '/pdf',
        epubUrl: baseUrl + '/ebook_download/' + bookId + '/epub',
        mobiUrl: baseUrl + '/ebook_download/' + bookId + '/mobi'
    };
}

function downloadBookFiles(bookDetails){    
    var mkdirp = require('mkdirp');
    var fs = require('fs');
    var pathModule = require('path');
    
    var getDirName = pathModule.dirname;

    var seperator = pathModule.sep;
    var currentFolder = process.cwd();
    
    downloadBook(bookDetails.pdfUrl, 'pdf', function(path){
        downloadBook(bookDetails.epubUrl, 'epub', function(path){
            downloadBook(bookDetails.mobiUrl, 'mobi', function(path){
                sendNotification(bookDetails.title);
            });
        });
    });

    function downloadBook(downloadUrl, extension, callback){
        var downloadPath = process.env.DOWNLOAD_PATH || 'downloads';
        var outputPath = pathModule.resolve(downloadPath, bookDetails.title, bookDetails.title + '.' + extension);
        downloadFile(downloadUrl, outputPath, callback);
    }

    function downloadFile(downloadUrl, outputPath, callback){
        console.log('Downloading "' + downloadUrl + '" to: ' + outputPath);  
        //callback(); return;//Skip download      
        var destination = createWriteFileStream(outputPath);
        //Lets save the modulus logo now
        request(downloadUrl)
            .pipe(destination)    
            .on('error', function(error){
                console.log('Error downloading "' + downloadUrl + '":' + error);
            }).on('finish', function() {
                console.log('Successful Download to: ' + outputPath);
                callback(outputPath);
            });

        function createWriteFileStream(path) {
            mkdirp.sync(getDirName(path));
            //Lets define a write stream for our destination file
            return fs.createWriteStream(path);
        }
    }  
}

function sendNotification(title){
    var url = require('url');
    var PushBullet = require('pushbullet');
    var pusher = new PushBullet(pushBulletDetails.apiKey);

    var noteBody = '';
    var linkDownloadPath = process.env.PUSHBULLET_LINK_DOWNLOAD_PATH;
    if (linkDownloadPath){
        linkDownloadPath = linkDownloadPath + title + '/' + title + '.pdf';
        var downloadUrl = url.parse(linkDownloadPath);
        noteBody = downloadUrl.href;
    }

    pusher.note(pushBulletDetails.target, 'New eBook Claimed: ' + title, noteBody, function(error, response) {
        if (error){
            console.log('Error Notifying "' + pushBulletDetails.target + '": ' + error);
            return;
        }
        // response is the JSON response from the API 
        console.log(pushBulletDetails.target + ' notified via PushBullet');
    });
}
