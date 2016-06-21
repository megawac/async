var async = require('../dist/async');
var fs = require('fs-extra');
var path = require('path');

var $ = require('cheerio');
var _ = require('lodash');

var docsDir = path.join(__dirname, '../docs');
var asyncFile = path.join(__dirname, '../dist/async.js');

var pageTitle = 'ASYNC';

var docFilename = 'docs.html';
var mainModuleFile = 'module-async.html';
var mainSectionId = '#main';
var sectionTitleClass = '.page-title'

var HTMLFileBegin = '<!DOCTYPE html>\n<html lang="en">\n<head>\n';
var HTMLFileHeadBodyJoin = '</head>\n<body>';
var HTMLFileEnd = '</body>';

var pageTitlePadding = '12px';

var additionalFooterText = ' Documentation has been modified from the original. ' +
    ' For more information, please see the <a href="https://github.com/caolan/async">async</a> repository.';

fs.copySync(asyncFile, path.join(docsDir, 'scripts/async.js'), { clobber: 'true'});

function generateHTMLFile(filename, $page, callback) {
    var HTMLdata = HTMLFileBegin + $page.find('head').html()
        + HTMLFileHeadBodyJoin + $page.find('body').html()
        + HTMLFileEnd;

    fs.writeFile(filename, HTMLdata, callback);
}

function extractModuleFiles(files) {
    return _.filter(files, function(file) {
        return _.startsWith(file, 'module') && file !== mainModuleFile;
    });
}

function combineFakeModules(files, callback) {
    var moduleFiles = extractModuleFiles(files);

    fs.readFile(path.join(docsDir, mainModuleFile), 'utf8', function(err, mainModuleData) {
        if (err) return callback(err);

        var $mainPage = $(mainModuleData);
        async.eachSeries(moduleFiles, function(file, fileCallback) {
            fs.readFile(path.join(docsDir, file), 'utf8', function(err, moduleData) {
                if (err) return fileCallback(err);
                var $modulePage = $(moduleData);
                var moduleName = $modulePage.find(sectionTitleClass).text();
                $modulePage.find(sectionTitleClass).attr('id', moduleName.toLowerCase());
                $mainPage.find(mainSectionId).append($modulePage.find(mainSectionId).html());
                return fileCallback();
            });
        }, function(err) {
            if (err) return callback(err);

            generateHTMLFile(path.join(docsDir, docFilename), $mainPage, callback);
        });
    });
}

function applyPreCheerioFixes(data) {
    var fixedPageTitleStyle = '<style>\n'+sectionTitleClass+' { padding-top: '+pageTitlePadding+'; }\n</style>'
    var closingHeadTag = '</head>'

    var asyncScript = '<script src="scripts/async.js"></script>';
    var closingBodyTag = '</body>';

    var rIncorrectCFText = />ControlFlow</g;
    var fixedCFText = '>Control Flow<';

    var rIncorrectModuleText = />module:(\w+)\.(\w+)</g

    return data.replace(closingHeadTag, fixedPageTitleStyle+closingHeadTag)
        .replace(closingBodyTag, asyncScript+closingBodyTag)
        .replace(rIncorrectCFText, fixedCFText)
        .replace(rIncorrectModuleText, function(match, moduleName, methodName) {
            return '>'+methodName+'<';
        });
};

function fixToc($page, moduleFiles) {
    // remove `async` listing from toc
    $page.find('li').find('a[href="'+mainModuleFile+'"]').parent().remove();

    // change page title
    $page.find('nav').children('h3').text(pageTitle);

    _.each(moduleFiles, function(filename) {
        $page.find('[href^="'+filename+'"]').each(function() {
            var $ele = $(this);
            var href = $ele.attr('href');

            if (href === filename) {
                var moduleName = $ele.text().toLowerCase().replace(/\s/g, '');
                $ele.attr('href', docFilename+'#'+moduleName);
            } else {
                $ele.attr('href', href.replace(filename, docFilename));
            }
        });
    });
}

function fixFooter($page) {
    var $footer = $page.find('footer');
    var text = $footer.text();
    $footer.append(additionalFooterText);
};

function fixModuleLinks(files, callback) {
    var moduleFiles = extractModuleFiles(files);

    async.each(files, function(file, fileCallback) {
        var filePath = path.join(docsDir, file);
        fs.readFile(filePath, 'utf8', function(err, fileData) {
            if (err) return fileCallback(err);
            var $file = $(applyPreCheerioFixes(fileData));

            fixToc($file, moduleFiles);

            fixFooter($file);
            $file.find('[href="'+mainModuleFile+'"]').attr('href', docFilename);
            generateHTMLFile(filePath, $file, fileCallback);
        });
    }, callback);
}

fs.readdir(docsDir, function(err, files) {
    if (err) {
        throw err;
    }

    var HTMLFiles = _.filter(files, function(file) {
        return path.extname(file) === '.html';
    });

    combineFakeModules(HTMLFiles, function(err) {
        if (err) throw err;

        HTMLFiles.push(docFilename);

        fixModuleLinks(HTMLFiles, function(err) {
            if (err) throw err;
            console.log('Docs generated successfully');
        });
    });
});
