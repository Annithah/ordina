# Translations to review

ORDINA is available in **English** (fallback), **French** and **Kinyarwanda**. English and French were
written by the developer; **every Kinyarwanda text needs a native speaker’s check**.

How to fix a text: edit `frontend-ordina/src/i18n/rw.ts` (or `fr.ts`). Keep words in `{curly braces}`
exactly as they are: the app fills them in (`{count}`, `{day}`, `{time}`…). `npm test` checks that
every language has every key and the same `{placeholders}`.

Notes:
- `task.tipNew` / `task.tipEdit` keep English example phrases on purpose: the offline task splitter only
  understands English keywords (“tomorrow at 7am”, “then”).
- Keys ending in `_one` / `_other` are the singular / plural forms.
- Dates use the month and weekday lists in `dates.*` (comma-separated).

## Please check first (Kinyarwanda)

| Key | English | Kinyarwanda | Question |
| --- | --- | --- | --- |
| `dates.anytime` | Anytime | Igihe icyo ari cyo cyose | Long for a chip; is there a shorter natural word for "no fixed time"? |
| `task.anytime` | Anytime | Igihe icyo ari cyo cyose | Same as above. |
| `categories.errands` | Errands | Guhaha n’utundi | "Guhaha n’utundi" (shopping and other small jobs): natural? |
| `categories.personal` | Personal | Ibyanjye bwite | "Ibyanjye bwite": natural for a category name? |
| `categories.health` | Health & Fitness | Ubuzima na siporo | Health & Fitness. |
| `priority.low` | Low | Buke | Priority words: Buke / Buringaniye / Bwinshi — or Hasi / Hagati / Hejuru? |
| `priority.medium` | Medium | Buringaniye | See priority.low. |
| `priority.high` | High | Bwinshi | See priority.low. |
| `status.pending` | Pending | Birategereje | Task status "Pending". |
| `status.overdue` | Overdue | Byatinze | Task status "Overdue" (late). |
| `tabs.profile` | Profile | Konti | Profile tab: "Konti" (account) or "Umwirondoro"? |
| `theme.light` | Light | Urumuri | Light theme: "Urumuri"? |
| `theme.dark` | Dark | Umwijima | Dark theme: "Umwijima"? |
| `dates.weekdaysShort` | Sun,Mon,Tue,Wed,Thu,Fri,Sat | Cyu.,Mbe.,Kab.,Gtu.,Kan.,Gnu.,Gnd. | Short weekday names (3-4 letters). |
| `dates.monthsShort` | Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec | Mut.,Gas.,Wer.,Mat.,Gic.,Kam.,Nya.,Kan.,Nze.,Ukw.,Ugu.,Uku. | Short month names. |
| `dates.weekdaysNarrow` | S,M,T,W,T,F,S | C,M,K,G,K,G,G | One letter per weekday (C, M, K, G, K, G, G) — several repeat. |
| `greeting.evening` | Good evening | Mwiriwe | Same as afternoon ("Mwiriwe"); is "Muraho" better at night? |
| `reminders.start` | At start time | Igihe utangira | "At start time". |
| `backup.title` | Backup & sync | Kubika no guhuza | "Kubika no guhuza" for "Backup & sync". |
| `account.headline` | Sign in to back up your tasks and use them on any phone. | Injira kugira ngo ubike imirimo yawe kandi uyikoreshe kuri telefoni iyo ari yo yose. | First sentence on the account screen. |
| `intro.s1Body` | Add tasks with a time, or mark them “Anytime” for the day. | Ongeraho imirimo ifite isaha, cyangwa “Igihe icyo ari cyo cyose” ku munsi. | Intro screen text (seen by every new user). |
| `intro.s2Body` | Type your plan in one paragraph. ORDINA splits it into tasks. | Andika gahunda yawe mu gika kimwe. ORDINA iyigabanyamo imirimo. | Intro screen text. |
| `intro.s3Body` | ORDINA AI turns your words into a day plan. It needs internet. | ORDINA AI ihindura amagambo yawe gahunda y’umunsi. Ikenera interineti. | Intro screen text. |
| `intro.s4Body` | Categories, search and reminders keep you on track, even offline. | Ibyiciro, gushakisha no kwibutswa bigufasha, kabone n’iyo nta interineti. | Intro screen text. |

## French choices to confirm

| Key | English | French | Question |
| --- | --- | --- | --- |
| `dates.anytime` | Anytime | N'importe quand | "N'importe quand" for tasks without a time — or "Sans heure"? |
| `categories.errands` | Errands | Courses | "Courses" for Errands (also means groceries). |
| `home.doneOverdue` | {done} done · {overdue} overdue | {done} terminée(s) · {overdue} en retard | Uses "terminée(s)" to avoid a plural rule; could be reworded. |

## All Kinyarwanda texts (537)

### brand

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `brand.tagline` | Put order in your day | Shyira gahunda ku munsi wawe |

### common

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `common.back` | Back | Subira inyuma |
| `common.cancel` | Cancel | Reka |
| `common.close` | Close | Funga |
| `common.save` | Save | Bika |
| `common.saving` | Saving… | Birabikwa… |
| `common.delete` | Delete | Siba |
| `common.edit` | Edit | Hindura |
| `common.done` | Done | Byarangiye |
| `common.remove` | Remove | Kuraho |
| `common.retry` | Try again | Ongera ugerageze |
| `common.next` | Next | Komeza |
| `common.skip` | Skip | Simbuka |
| `common.continue` | Continue | Komeza |
| `common.getStarted` | Get started | Tangira |
| `common.ok` | OK | Yego |
| `common.clearAll` | Clear all | Siba byose |
| `common.comingSoon` | Coming soon | Biraza vuba |
| `common.loading` | Loading… | Birimo gufunguka… |
| `common.openSettings` | Open settings | Fungura igenamiterere |
| `common.notNow` | Not now | Ubu oya |
| `common.moveUp` | Move up | Zamura |
| `common.moveDown` | Move down | Manura |

### tabs

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `tabs.home` | Home | Ahabanza |
| `tabs.tasks` | Tasks | Imirimo |
| `tabs.calendar` | Schedule | Gahunda |
| `tabs.profile` | Profile | Konti |

### dates

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `dates.today` | Today | Uyu munsi |
| `dates.tomorrow` | Tomorrow | Ejo |
| `dates.yesterday` | Yesterday | Ejo hashize |
| `dates.months` | January,February,March,April,May,June,July,August,September,October,November,December | Mutarama,Gashyantare,Werurwe,Mata,Gicurasi,Kamena,Nyakanga,Kanama,Nzeri,Ukwakira,Ugushyingo,Ukuboza |
| `dates.monthsShort` | Jan,Feb,Mar,Apr,May,Jun,Jul,Aug,Sep,Oct,Nov,Dec | Mut.,Gas.,Wer.,Mat.,Gic.,Kam.,Nya.,Kan.,Nze.,Ukw.,Ugu.,Uku. |
| `dates.weekdays` | Sunday,Monday,Tuesday,Wednesday,Thursday,Friday,Saturday | Ku cyumweru,Ku wa mbere,Ku wa kabiri,Ku wa gatatu,Ku wa kane,Ku wa gatanu,Ku wa gatandatu |
| `dates.weekdaysShort` | Sun,Mon,Tue,Wed,Thu,Fri,Sat | Cyu.,Mbe.,Kab.,Gtu.,Kan.,Gnu.,Gnd. |
| `dates.weekdaysNarrow` | S,M,T,W,T,F,S | C,M,K,G,K,G,G |
| `dates.longDate` | {weekday} {day} {month} | {weekday}, {day} {month} |
| `dates.shortDate` | {weekday} {day} {month} | {weekday} {day} {month} |
| `dates.monthYear` | {month} {year} | {month} {year} |
| `dates.moment` | {day} {time} | {day} saa {time} |
| `dates.minutes` | {n} min | iminota {n} |
| `dates.hours` | {n} h | amasaha {n} |
| `dates.hoursMinutes` | {h} h {m} min | amasaha {h} n’iminota {m} |
| `dates.anytime` | Anytime | Igihe icyo ari cyo cyose |
| `dates.noDate` | No date | Nta tariki |

### greeting

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `greeting.morning` | Good morning | Mwaramutse |
| `greeting.afternoon` | Good afternoon | Mwiriwe |
| `greeting.evening` | Good evening | Mwiriwe |
| `greeting.withName` | {greeting}, {name} | {greeting}, {name} |

### status

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `status.pending` | Pending | Birategereje |
| `status.completed` | Completed | Byarangiye |
| `status.overdue` | Overdue | Byatinze |
| `status.inProgress` | In progress | Birakorwa |
| `status.started` | Started | Byatangiye |
| `status.planned` | Planned | Byateganyijwe |

### priority

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `priority.label` | Priority | Uburemere |
| `priority.low` | Low | Buke |
| `priority.medium` | Medium | Buringaniye |
| `priority.high` | High | Bwinshi |

### categories

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `categories.label` | Category | Icyiciro |
| `categories.work` | Work | Akazi |
| `categories.study` | Study | Kwiga |
| `categories.personal` | Personal | Ibyanjye bwite |
| `categories.health` | Health & Fitness | Ubuzima na siporo |
| `categories.family` | Family | Umuryango |
| `categories.finance` | Finance | Imari |
| `categories.errands` | Errands | Guhaha n’utundi |
| `categories.other` | Other | Ibindi |
| `categories.manage` | Manage categories | Gucunga ibyiciro |
| `categories.manageHint` | Rename, recolor, reorder or delete categories. Deleting one never deletes its tasks. | Hindura izina, ibara cyangwa urutonde rw’ibyiciro, cyangwa ubisibe. Gusiba icyiciro ntibisiba imirimo yacyo. |
| `categories.add` | Add category | Ongeraho icyiciro |
| `categories.editTitle` | Edit category | Hindura icyiciro |
| `categories.newTitle` | New category | Icyiciro gishya |
| `categories.name` | Name | Izina |
| `categories.namePlaceholder` | e.g. Church, Side project | urugero: Urusengero, Umushinga |
| `categories.color` | Color | Ibara |
| `categories.icon` | Icon | Ikimenyetso |
| `categories.errorEmpty` | Please enter a name. | Andika izina. |
| `categories.errorTooLong` | Use 30 characters or fewer. | Koresha inyuguti 30 cyangwa nke. |
| `categories.errorDuplicate` | You already have a category with this name. | Usanzwe ufite icyiciro gifite iri zina. |
| `categories.count_one` | {count} task | umurimo {count} |
| `categories.count_other` | {count} tasks | imirimo {count} |
| `categories.deleteTitle` | Delete “{name}”? | Gusiba “{name}”? |
| `categories.deleteEmpty` | This category has no tasks. | Iki cyiciro nta mirimo gifite. |
| `categories.deleteMove_one` | Its {count} task will move to: | Umurimo wacyo {count} uzimurirwa muri: |
| `categories.deleteMove_other` | Its {count} tasks will move to: | Imirimo yacyo {count} izimurirwa muri: |
| `categories.deleteLast` | Keep at least one category. | Gumana nibura icyiciro kimwe. |
| `categories.deleted` | Category deleted | Icyiciro cyasibwe |
| `categories.saved` | Category saved | Icyiciro cyabitswe |
| `categories.suggested` | Suggested | Icyatanzwe |

### home

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `home.tellOrdina` | Tell ORDINA what to do… | Bwira ORDINA icyo ukora… |
| `home.searchPlaceholder` | Search tasks | Shakisha imirimo |
| `home.clearSearch` | Clear search | Siba ibyo washakishije |
| `home.viewByTime` | By time | Ukurikije igihe |
| `home.viewByCategory` | By category | Ukurikije icyiciro |
| `home.todaySummary_one` | {count} task to do today | Umurimo {count} wo gukora uyu munsi |
| `home.todaySummary_other` | {count} tasks to do today | Imirimo {count} yo gukora uyu munsi |
| `home.allDoneToday` | All done for today 🎉 | Byose byarangiye uyu munsi 🎉 |
| `home.nothingToday` | Nothing planned today yet | Nta kintu kirateganywa uyu munsi |
| `home.doneOverdue` | {done} done · {overdue} overdue | {done} byarangiye · {overdue} byatinze |
| `home.doneOnly` | {done} done | {done} byarangiye |
| `home.planWithAi` | Plan with AI | Tegura na AI |
| `home.noMatches` | No tasks match your filters | Nta mirimo ihuye n’ibyo wahisemo |
| `home.noMatchesHint` | Try another word, or clear the filters. | Gerageza irindi jambo, cyangwa usibe ibyo wahisemo. |
| `home.noTasksYet` | No tasks yet | Nta mirimo urashyiraho |
| `home.noTasksYetHint` | Tap + to add a task, or ask ORDINA to plan your day. | Kanda + wongereho umurimo, cyangwa usabe ORDINA gutegura umunsi wawe. |
| `home.addTask` | Add a task | Ongeraho umurimo |
| `home.results_one` | {count} task | umurimo {count} |
| `home.results_other` | {count} tasks | imirimo {count} |
| `home.collapse` | Hide {name} | Hisha {name} |
| `home.expand` | Show {name} | Erekana {name} |

### filters

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `filters.category` | Category | Icyiciro |
| `filters.status` | Status | Uko bihagaze |
| `filters.date` | Date | Itariki |
| `filters.priority` | Priority | Uburemere |
| `filters.statusAll` | All | Byose |
| `filters.statusPending` | Pending | Birategereje |
| `filters.statusCompleted` | Completed | Byarangiye |
| `filters.statusOverdue` | Overdue | Byatinze |
| `filters.dateAny` | Any day | Umunsi uwo ari wo wose |
| `filters.dateToday` | Today | Uyu munsi |
| `filters.dateTomorrow` | Tomorrow | Ejo |
| `filters.dateWeek` | This week | Iki cyumweru |
| `filters.dateUpcoming` | All upcoming | Ibiri imbere byose |
| `filters.dateCustom` | Custom range | Hitamo amatariki |
| `filters.from` | From | Kuva |
| `filters.to` | To | Kugeza |
| `filters.pickRange` | Choose dates | Hitamo amatariki |
| `filters.rangeFromTo` | {from} – {to} | {from} – {to} |
| `filters.rangeFrom` | From {from} | Kuva {from} |
| `filters.rangeTo` | Until {to} | Kugeza {to} |
| `filters.searchChip` | “{text}” | “{text}” |
| `filters.removeFilter` | Remove filter {name} | Kuraho {name} |
| `filters.apply` | Show tasks | Erekana imirimo |

### task

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `task.newTitle` | New task | Umurimo mushya |
| `task.editTitle` | Edit task | Hindura umurimo |
| `task.titlePlaceholder` | What do you need to do? | Ukeneye gukora iki? |
| `task.planPlaceholder` | What do you need to do? You can write your whole plan. | Ukeneye gukora iki? Ushobora kwandika gahunda yawe yose. |
| `task.titleLabel` | Task title | Umutwe w’umurimo |
| `task.descriptionPlaceholder` | Add a description (optional) | Ongeraho ibisobanuro (si ngombwa) |
| `task.descriptionLabel` | Task description | Ibisobanuro by’umurimo |
| `task.when` | When | Ryari |
| `task.day` | Day | Umunsi |
| `task.time` | Time | Isaha |
| `task.anytime` | Anytime | Igihe icyo ari cyo cyose |
| `task.anytimeHint` | No fixed time. It stays on this day until the day ends. | Nta saha ihamye. Uguma kuri uyu munsi kugeza umunsi urangiye. |
| `task.pickTime` | Pick a time | Hitamo isaha |
| `task.pickDate` | Pick a date | Hitamo itariki |
| `task.inThePast` | In the past | Byarenze |
| `task.duration` | Duration | Igihe bizamara |
| `task.noDuration` | No duration | Nta gihe |
| `task.customDuration` | Custom | Ikindi gihe |
| `task.customDurationTitle` | How long? | Bizamara igihe kingana iki? |
| `task.hours` | Hours | Amasaha |
| `task.minutesShort` | Minutes | Iminota |
| `task.durationRange` | Between 5 minutes and 12 hours. | Hagati y’iminota 5 n’amasaha 12. |
| `task.endsAt` | Ends at {time} | Birangira saa {time} |
| `task.overlap` | Overlaps with {titles}. You can still save it. | Bihura na {titles}. Ushobora kubika uko byagenda kose. |
| `task.reminder` | Reminder | Kwibutswa |
| `task.create` | Create task | Ongeraho umurimo |
| `task.saveChanges` | Save changes | Bika impinduka |
| `task.review_other` | Review {count} tasks | Reba imirimo {count} |
| `task.review_one` | Review 1 task | Reba umurimo 1 |
| `task.found_other` | {count} tasks found. You can check them before saving. | Habonetse imirimo {count}. Uzayireba mbere yo kuyibika. |
| `task.found_one` | 1 task found. | Habonetse umurimo 1. |
| `task.tipEdit` | Tip: type “tomorrow at 7am” and ORDINA fills in the time. | Inama: andika “tomorrow at 7am” ORDINA yuzuze isaha. |
| `task.tipNew` | Tip: write several things, like “gym at 6pm, then call mom”, and ORDINA makes separate tasks. | Inama: andika ibintu byinshi, nka “gym at 6pm, then call mom”, ORDINA ikore imirimo itandukanye. |
| `task.setTo` | Set to {label} | Shyira kuri {label} |
| `task.tapToApply` | Tap to apply | Kanda ubyemeze |
| `task.added` | Task added to your plan | Umurimo wongewe kuri gahunda yawe |
| `task.addedMany_other` | {count} tasks added to your plan | Imirimo {count} yongewe kuri gahunda yawe |
| `task.addedMany_one` | 1 task added to your plan | Umurimo 1 wongewe kuri gahunda yawe |
| `task.saved` | Changes saved | Impinduka zabitswe |
| `task.deleted` | Task deleted | Umurimo wasibwe |
| `task.deleteTitle` | Delete this task? | Gusiba uyu murimo? |
| `task.deleteMessage` | “{title}” will be removed from your plan. This cannot be undone. | “{title}” izakurwa kuri gahunda yawe. Ntibishobora gusubizwa. |
| `task.notFound` | Task not found | Umurimo ntubonetse |
| `task.notFoundHint` | It may have been deleted. | Ushobora kuba wasibwe. |
| `task.backToTasks` | Back to tasks | Subira ku mirimo |
| `task.markDone` | Mark “{title}” as done | Emeza ko “{title}” yarangiye |
| `task.markNotDone` | Mark “{title}” as not done | Emeza ko “{title}” itarangiye |
| `task.completedToast` | Nice work! Task completed | Wakoze neza! Umurimo urangiye |
| `task.uncompletedToast` | Marked as not done | Byashyizwe nk’ibitarangiye |
| `task.start` | Start task | Tangira umurimo |
| `task.pause` | Pause task | Hagarika umurimo |
| `task.deadline` | Deadline: {day} | Itariki ntarengwa: {day} |
| `task.deadlineBefore` | Deadline: {day}, before {time} | Itariki ntarengwa: {day}, mbere ya {time} |
| `task.removeDeadline` | Remove deadline | Kuraho itariki ntarengwa |
| `task.dueBy` | Due {day} by {time} | Bigomba kurangira {day} mbere ya {time} |
| `task.due` | Due {day} | Bigomba kurangira {day} |
| `task.previewTitle` | New tasks | Imirimo mishya |
| `task.previewHeading_one` | ORDINA found 1 task | ORDINA yabonye umurimo 1 |
| `task.previewHeading_other` | ORDINA found {count} tasks | ORDINA yabonye imirimo {count} |
| `task.previewSub` | Check them before saving. Tap a task to change it, or remove it. | Yireba mbere yo kuyibika. Kanda ku murimo uwuhindure cyangwa uwukureho. |
| `task.createMany_one` | Create 1 task | Ongeraho umurimo 1 |
| `task.createMany_other` | Create {count} tasks | Ongeraho imirimo {count} |
| `task.backToText` | Back to your text | Subira ku byo wanditse |
| `task.morningHint` | Morning | Mu gitondo |
| `task.afternoonHint` | Afternoon | Ku manywa |
| `task.eveningHint` | Evening | Nimugoroba |
| `task.nightHint` | Night | Nijoro |
| `task.findSlot` | Find a free slot | Shaka igihe kirimo ubusa |
| `task.dayFull` | This day is full | Uyu munsi wuzuye |
| `task.dayFullBody` | There is no {duration} gap left on {day}. | Nta gihe cya {duration} gisigaye: {day}. |
| `task.dayFullMove` | There is no {duration} gap left on {day}. {nextDay} at {time} is free. | Nta gihe cya {duration} gisigaye: {day}. {nextDay} saa {time} harimo ubusa. |
| `task.keepAsIs` | Keep as is | Bigume uko biri |
| `task.moveIt` | Move it | Bimure |
| `task.loadPlanned` | {day}: {duration} already planned | {day}: {duration} byateganyijwe |
| `task.loadNothing` | {day}: nothing planned yet | {day}: nta kintu kirateganywa |
| `task.loadLight` | Light | Byoroheje |
| `task.loadBusy` | Busy | Byinshi |
| `task.loadOverloaded` | Overloaded | Birenze |
| `task.afterHint` | After “{title}” | Nyuma ya “{title}” |

### ai

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `ai.title` | ORDINA AI | ORDINA AI |
| `ai.stateReady` | Ready | Yiteguye |
| `ai.stateListening` | Listening… | Irumva… |
| `ai.stateTranscribing` | Transcribing… | Irandika… |
| `ai.stateThinking` | Thinking… | Iratekereza… |
| `ai.stateReview` | Review | Kureba |
| `ai.stateDone` | Done | Byarangiye |
| `ai.stateError` | Try again | Ongera ugerageze |
| `ai.welcomeTitle` | Tell ORDINA what you need to get done. | Bwira ORDINA icyo ukeneye gukora. |
| `ai.welcomeBody` | Describe your day in your own words, for example “Study Python for two hours tomorrow morning and call my mentor at 6 PM”. ORDINA builds a plan you can edit before anything is saved. | Sobanura umunsi wawe mu magambo yawe, urugero “Kwiga Python amasaha abiri ejo mu gitondo no guhamagara umujyanama wanjye saa 18:00”. ORDINA igutegurira gahunda ushobora guhindura mbere y’uko hagira ikibikwa. |
| `ai.planning` | ORDINA is planning your day… | ORDINA irimo gutegura umunsi wawe… |
| `ai.updating` | Updating your plan… | Gahunda yawe irimo kuvugururwa… |
| `ai.adding` | Adding tasks… | Imirimo irongerwaho… |
| `ai.added_one` | Added 1 task to your plan. | Umurimo 1 wongewe kuri gahunda yawe. |
| `ai.added_other` | Added {count} tasks to your plan. | Imirimo {count} yongewe kuri gahunda yawe. |
| `ai.discarded` | Plan discarded. Nothing was saved. | Gahunda yaretswe. Nta kintu cyabitswe. |
| `ai.placeholder` | Tell ORDINA what you need to get done. | Bwira ORDINA icyo ukeneye gukora. |
| `ai.listeningPlaceholder` | Listening… tap stop when done | Irumva… kanda guhagarara nurangiza |
| `ai.send` | Send | Ohereza |
| `ai.speak` | Speak your request | Vuga icyo usaba |
| `ai.stopRecording` | Stop recording | Hagarika gufata amajwi |
| `ai.dismiss` | Dismiss | Funga |
| `ai.couldNotPlan` | ORDINA AI could not plan that. Please try again. | ORDINA AI ntiyashoboye kubitegura. Ongera ugerageze. |
| `ai.couldNotUpdate` | ORDINA AI could not update the plan. Please try again. | ORDINA AI ntiyashoboye kuvugurura gahunda. Ongera ugerageze. |
| `ai.couldNotSave` | Your plan could not be saved. Please try again. | Gahunda yawe ntiyabitswe. Ongera ugerageze. |
| `ai.serverUnreachable` | ORDINA AI cannot reach its server right now. Please try again in a moment. | ORDINA AI ntishobora kugera kuri seriveri yayo ubu. Ongera ugerageze mu kanya. |
| `ai.waking` | Waking up the ORDINA server. This can take up to a minute. | Seriveri ya ORDINA irimo gukanguka. Bishobora gufata umunota umwe. |
| `ai.voiceTitle` | Voice | Ijwi |
| `ai.voiceWeb` | Voice is not available here. Type your request instead. | Ijwi ntirikora hano. Andika icyo usaba. |
| `ai.voiceSaveFailed` | The recording could not be saved. Please try again. | Amajwi ntiyabitswe. Ongera ugerageze. |
| `ai.voiceTooLong` | That recording is too long. Try a shorter message. | Ayo majwi ni maremare cyane. Gerageza ubutumwa bugufi. |
| `ai.voiceNoWords` | I could not hear any words. Please try speaking again. | Nta jambo numvise. Ongera uvuge. |
| `ai.voiceUnavailable` | Voice is not available on this device. | Ijwi ntirikora kuri iyi telefoni. |
| `ai.micTitle` | Microphone | Mikoro |
| `ai.micDenied` | ORDINA needs the microphone to turn speech into tasks. You can allow it in your phone settings. | ORDINA ikeneye mikoro kugira ngo ihindure ijwi ryawe imirimo. Ushobora kuyemera mu igenamiterere rya telefoni. |
| `ai.backOnline` | You are back online. | Wongeye kugira interineti. |

### backup

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `backup.title` | Backup & sync | Kubika no guhuza |
| `backup.intro` | If your phone is lost or changed, a backup keeps your tasks safe. | Niba telefoni yawe ibuze cyangwa uyihinduye, kubika birinda imirimo yawe. |
| `backup.fileSection` | Backup file | Dosiye yo kubika |
| `backup.fileHint` | Works without an account or internet. Save the file somewhere safe, like Google Drive or your email. | Bikora nta konti cyangwa interineti. Bika dosiye ahantu hizewe, nka Google Drive cyangwa imeri yawe. |
| `backup.export` | Export backup | Kora dosiye yo kubika |
| `backup.exportHint` | Creates a file with all your tasks, categories and settings. | Ikora dosiye irimo imirimo yawe yose, ibyiciro n’igenamiterere. |
| `backup.import` | Import backup | Garura ibyabitswe |
| `backup.importHint` | Restore tasks from a backup file. | Garura imirimo uvuye kuri dosiye yo kubika. |
| `backup.shareTitle` | Save your ORDINA backup | Bika dosiye ya ORDINA |
| `backup.exported` | Backup file ready | Dosiye yo kubika yiteguye |
| `backup.shareUnavailable` | Sharing is not available on this device. | Gusangiza ntibikora kuri iyi telefoni. |
| `backup.lastExport` | Last backup file: {moment} | Dosiye iheruka: {moment} |
| `backup.neverExported` | No backup file yet | Nta dosiye yo kubika irakorwa |
| `backup.importTitle` | Restore this backup? | Kugarura ibi byabitswe? |
| `backup.importSummary_one` | This file has 1 task from {date}. | Iyi dosiye irimo umurimo 1 wo ku wa {date}. |
| `backup.importSummary_other` | This file has {count} tasks from {date}. | Iyi dosiye irimo imirimo {count} yo ku wa {date}. |
| `backup.replace` | Replace | Simbuza |
| `backup.replaceHint` | Your phone will have exactly what is in the file. | Telefoni yawe izagira ibiri muri dosiye gusa. |
| `backup.merge` | Merge | Huza |
| `backup.mergeHint` | Keep your tasks and add the ones from the file. Nothing is duplicated. | Gumana imirimo yawe wongereho iyo muri dosiye. Nta kintu kizasubirwamo kabiri. |
| `backup.imported` | Restored: {added} added, {updated} updated | Byagaruwe: {added} byongewe, {updated} byavuguruwe |
| `backup.importedReplace` | Restored: {added} added, {updated} updated, {removed} removed | Byagaruwe: {added} byongewe, {updated} byavuguruwe, {removed} byakuweho |
| `backup.error_notJson` | This is not an ORDINA backup file. | Iyi si dosiye yo kubika ya ORDINA. |
| `backup.error_notOrdina` | This is not an ORDINA backup file. | Iyi si dosiye yo kubika ya ORDINA. |
| `backup.error_newerFormat` | This backup was made by a newer ORDINA. Please update the app first. | Iyi dosiye yakozwe na ORDINA nshya. Banza uvugurure porogaramu. |
| `backup.error_invalid` | This backup file is damaged. Nothing was changed. | Iyi dosiye yangiritse. Nta kintu cyahindutse. |
| `backup.error_tooLarge` | This backup file is too large. | Iyi dosiye ni nini cyane. |
| `backup.errorRead` | Could not read that file. Nothing was changed. | Ntibyashobotse gusoma iyo dosiye. Nta kintu cyahindutse. |
| `backup.exportFailed` | Could not create the backup file. Please try again. | Ntibyashobotse gukora dosiye yo kubika. Ongera ugerageze. |
| `backup.reminderSection` | Backup reminder | Kwibutswa kubika |
| `backup.reminderToggle` | Remind me to back up | Unyibutse kubika |
| `backup.reminderHint` | Only when you are not signed in. Signed-in users are backed up automatically. | Igihe utinjiye muri konti gusa. Abinjiye babikirwa ubwabo. |
| `backup.weekly` | Weekly | Buri cyumweru |
| `backup.monthly` | Monthly | Buri kwezi |
| `backup.reminderTitle` | Protect your tasks | Rinda imirimo yawe |
| `backup.reminderBody` | Back up ORDINA so you don’t lose your tasks if your phone is lost. | Bika ORDINA kugira ngo utabura imirimo yawe telefoni nibura. |
| `backup.serverSection` | Server backup and sync | Kubika kuri seriveri no guhuza |
| `backup.serverHint` | Sign in to back up your tasks automatically and use them on any phone. | Injira kugira ngo imirimo yawe ibikwe ubwayo kandi uyikoreshe kuri telefoni iyo ari yo yose. |
| `backup.signIn` | Sign in or create an account | Injira cyangwa ufungure konti |
| `backup.backupNow` | Backup now | Bika ubu |
| `backup.lastBackup` | Last backed up: {moment} | Byabitswe bwa nyuma: {moment} |
| `backup.neverBackedUp` | Not backed up yet | Ntibirabikwa |
| `backup.waiting` | Waiting for internet | Bitegereje interineti |
| `backup.syncing` | Backing up… | Birabikwa… |
| `backup.syncError` | Sync error — tap to retry | Guhuza byanze — kanda wongere ugerageze |
| `backup.serverNotConnected` | Server not connected yet | Seriveri ntirahuzwa |
| `backup.synced` | Your tasks are backed up | Imirimo yawe irabitswe |

### intro

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `intro.progress` | Step {n} of {total} | Intambwe ya {n} kuri {total} |
| `intro.s1Title` | Plan your day | Tegura umunsi wawe |
| `intro.s1Body` | Add tasks with a time, or mark them “Anytime” for the day. | Ongeraho imirimo ifite isaha, cyangwa “Igihe icyo ari cyo cyose” ku munsi. |
| `intro.s2Title` | Write it all at once | Andika byose icyarimwe |
| `intro.s2Body` | Type your plan in one paragraph. ORDINA splits it into tasks. | Andika gahunda yawe mu gika kimwe. ORDINA iyigabanyamo imirimo. |
| `intro.s3Title` | Let ORDINA AI organise | ORDINA AI irategura |
| `intro.s3Body` | ORDINA AI turns your words into a day plan. It needs internet. | ORDINA AI ihindura amagambo yawe gahunda y’umunsi. Ikenera interineti. |
| `intro.s4Title` | Stay on track | Komeza ku murongo |
| `intro.s4Body` | Categories, search and reminders keep you on track, even offline. | Ibyiciro, gushakisha no kwibutswa bigufasha, kabone n’iyo nta interineti. |

### account

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `account.headline` | Sign in to back up your tasks and use them on any phone. | Injira kugira ngo ubike imirimo yawe kandi uyikoreshe kuri telefoni iyo ari yo yose. |
| `account.create` | Create account | Fungura konti |
| `account.login` | Log in | Injira |
| `account.fullName` | Full name | Amazina yose |
| `account.namePlaceholder` | Your name | Izina ryawe |
| `account.email` | Email | Imeri |
| `account.emailPlaceholder` | you@example.com | wowe@urugero.com |
| `account.password` | Password | Ijambobanga |
| `account.newPasswordPlaceholder` | At least 8 characters | Nibura inyuguti 8 |
| `account.passwordPlaceholder` | Your password | Ijambobanga ryawe |
| `account.confirm` | Confirm password | Emeza ijambobanga |
| `account.confirmPlaceholder` | Type it again | Ongera uryandike |
| `account.showPassword` | Show password | Erekana ijambobanga |
| `account.hidePassword` | Hide password | Hisha ijambobanga |
| `account.forgot` | Forgot password? | Wibagiwe ijambobanga? |
| `account.or` | or continue with | cyangwa ukomeze na |
| `account.google` | Continue with Google | Komeza na Google |
| `account.apple` | Continue with Apple | Komeza na Apple |
| `account.providerSoon` | {provider} sign-in is coming soon. | Kwinjira ukoresheje {provider} biraza vuba. |
| `account.noEmail` | Don’t have an email? Create a free Google account | Nta imeri ufite? Fungura konti ya Google ku buntu |
| `account.skip` | Continue without an account | Komeza nta konti |
| `account.nameRequired` | Please enter your full name. | Andika amazina yawe yose. |
| `account.emailRequired` | Please enter your email. | Andika imeri yawe. |
| `account.emailInvalid` | Please enter a valid email address. | Andika imeri nyayo. |
| `account.passwordRequired` | Please enter your password. | Andika ijambobanga ryawe. |
| `account.passwordShort` | Use at least 8 characters. | Koresha nibura inyuguti 8. |
| `account.confirmRequired` | Please confirm your password. | Emeza ijambobanga ryawe. |
| `account.mismatch` | Passwords do not match. | Amagambobanga ntahuye. |
| `account.created` | Account created. Your tasks are being backed up. | Konti yafunguwe. Imirimo yawe irimo kubikwa. |
| `account.welcomeBack` | Welcome back! Your tasks are syncing. | Murakaza neza! Imirimo yawe irimo guhuzwa. |
| `account.signedOut` | Signed out. Your tasks stay on this phone. | Wasohotse. Imirimo yawe iguma kuri iyi telefoni. |
| `account.forgotTitle` | Reset your password | Hindura ijambobanga |
| `account.forgotBody` | Enter your email. We will send you a 6-digit code. | Andika imeri yawe. Turakoherereza kode y’imibare 6. |
| `account.sendCode` | Send code | Ohereza kode |
| `account.codeSent` | If an account exists for {email}, we sent a 6-digit code. It works for 15 minutes. | Niba hari konti ya {email}, twohereje kode y’imibare 6. Ikora iminota 15. |
| `account.code` | Code | Kode |
| `account.codePlaceholder` | 6-digit code | Kode y’imibare 6 |
| `account.codeInvalid` | Enter the 6-digit code from the email. | Andika kode y’imibare 6 wahawe kuri imeri. |
| `account.newPassword` | New password | Ijambobanga rishya |
| `account.resetButton` | Set new password | Bika ijambobanga rishya |
| `account.resetDone` | Password changed. You can log in now. | Ijambobanga ryahinduwe. Ushobora kwinjira ubu. |
| `account.backToLogin` | Back to log in | Subira ku kwinjira |
| `account.serverNotConnected` | Server not connected yet. Accounts will work once the ORDINA server is online. Your tasks are safe on this phone. | Seriveri ntirahuzwa. Konti zizakora seriveri ya ORDINA nimara gufunguka. Imirimo yawe irinzwe kuri iyi telefoni. |
| `account.usingWithout` | Using ORDINA without an account | Ukoresha ORDINA nta konti |
| `account.usingWithoutHint` | Your tasks stay on this phone. Tap to create an account or log in. | Imirimo yawe iguma kuri iyi telefoni. Kanda ufungure konti cyangwa winjire. |
| `account.avatar` | Profile picture with the letters {initials} | Ifoto ya konti ifite inyuguti {initials} |
| `account.syncStatus` | Sync status | Uko guhuza bihagaze |
| `account.signOut` | Sign out | Sohoka |
| `account.signOutTitle` | Sign out? | Gusohoka? |
| `account.signOutBody` | Your tasks stay on this phone. Sign in again any time to sync them. | Imirimo yawe iguma kuri iyi telefoni. Ongera winjire igihe icyo ari cyo cyose kugira ngo uyihuze. |
| `account.changePassword` | Change password | Hindura ijambobanga |
| `account.currentPassword` | Current password | Ijambobanga rya none |
| `account.passwordChanged` | Password changed. | Ijambobanga ryahinduwe. |
| `account.deleteAccount` | Delete account | Siba konti |
| `account.deleteTitle` | Delete your account? | Gusiba konti yawe? |
| `account.deleteBody` | This deletes your ORDINA account and its server backup. Tasks on this phone are kept. This cannot be undone. | Ibi bisiba konti yawe ya ORDINA n’ibyo yabitse kuri seriveri. Imirimo iri kuri iyi telefoni irasigara. Ntibishobora gusubizwa. |
| `account.deletePassword` | Enter your password to confirm | Andika ijambobanga ryawe kugira ngo wemeze |
| `account.deleted` | Account deleted. Your tasks stay on this phone. | Konti yasibwe. Imirimo yawe iguma kuri iyi telefoni. |

### settings

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `settings.title` | Settings | Igenamiterere |
| `settings.account` | Account | Konti |
| `settings.profile` | Profile | Umwirondoro |
| `settings.signedOutRow` | Sign in or create an account | Injira cyangwa ufungure konti |
| `settings.preferences` | Preferences | Ibyo ukunda |
| `settings.language` | Language | Ururimi |
| `settings.theme` | Theme | Isura |
| `settings.weekStart` | Start of week | Icyumweru gitangira |
| `settings.monday` | Monday | Ku wa mbere |
| `settings.sunday` | Sunday | Ku cyumweru |
| `settings.defaultView` | Default task view | Uko imirimo igaragara |
| `settings.tasks` | Tasks | Imirimo |
| `settings.defaultDuration` | Default duration | Igihe gisanzwe |
| `settings.defaultCategory` | Default category | Icyiciro gisanzwe |
| `settings.manageCategories` | Manage categories | Gucunga ibyiciro |
| `settings.reminders` | Reminders | Kwibutswa |
| `settings.remindersOn` | Reminders | Kwibutswa |
| `settings.remindersOnHint` | Notifications for tasks with a reminder. | Ubutumwa ku mirimo ifite kwibutswa. |
| `settings.defaultReminder` | Default reminder | Kwibutswa gusanzwe |
| `settings.backup` | Backup & sync | Kubika no guhuza |
| `settings.backupRow` | Backup, restore and sync | Kubika, kugarura no guhuza |
| `settings.security` | Security | Umutekano |
| `settings.appLock` | App passkey | Umubare w’ibanga wa porogaramu |
| `settings.about` | About | Ibyerekeye |
| `settings.version` | App version | Verisiyo ya porogaramu |
| `settings.viewIntro` | View intro | Reba intangiriro |
| `settings.privacy` | Privacy policy | Politiki y’ibanga |
| `settings.contact` | Contact | Twandikire |
| `settings.contactSoon` | Contact details are coming soon. | Aho watwandikira haraza vuba. |
| `settings.privacySoon` | The privacy policy page is coming soon. | Urupapuro rwa politiki y’ibanga ruraza vuba. |
| `settings.choose` | Choose | Hitamo |

### week

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `week.previous` | Previous week | Icyumweru gishize |
| `week.next` | Next week | Icyumweru gitaha |
| `week.today` | Today | Uyu munsi |
| `week.dayLabel` | {day}, {count} open tasks | {day}, imirimo {count} itarakorwa |
| `week.overdueEarlier` | Overdue from earlier | Byatinze mu minsi ishize |
| `week.noTasksDay` | Nothing planned for this day. | Nta kintu giteganyijwe uyu munsi. |
| `week.addForDay` | Add a task for this day | Ongeraho umurimo kuri uyu munsi |
| `week.dayDone` | {done} of {total} done | {done} kuri {total} byarangiye |

### schedule

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `schedule.prevMonth` | Previous month | Ukwezi gushize |
| `schedule.nextMonth` | Next month | Ukwezi gutaha |
| `schedule.title` | Schedule | Gahunda |
| `schedule.weekView` | Week | Icyumweru |
| `schedule.monthView` | Month | Ukwezi |
| `schedule.created` | Your plan is ready | Gahunda yawe yiteguye |
| `schedule.createdSub_one` | 1 task was added. | Umurimo 1 wongewemo. |
| `schedule.createdSub_other` | {count} tasks were added. | Imirimo {count} yongewemo. |
| `schedule.viewTasks` | See my tasks | Reba imirimo yanjye |
| `schedule.empty` | View your tasks on the Home or Tasks tab. | Reba imirimo yawe ahabanza cyangwa ku mirimo. |
| `schedule.monthHint` | Tap a day to see its tasks. | Kanda ku munsi urebe imirimo yawo. |
| `schedule.noTime` | No time set | Nta saha |

### plan

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `plan.reviewTitle` | Review your plan | Reba gahunda yawe |
| `plan.reviewSub` | Nothing is saved until you add it. Edit or remove anything first. | Nta kibikwa utarakyemeza. Hindura cyangwa ukureho icyo ushaka mbere. |
| `plan.legendSuggested` | Suggested | Icyatanzwe |
| `plan.legendHabit` | Your usual | Ibyo usanzwe ukora |
| `plan.legendYours` | What you said · tap a task to edit | Ibyo wavuze · kanda ku murimo uwuhindure |
| `plan.legendA11y` | Sparkles mark ORDINA suggestions, the repeat icon marks values from your habits, plain values are what you said. | Inyenyeri zerekana ibyo ORDINA itanga, ikimenyetso cyo gusubiramo cyerekana ibyo usanzwe ukora, ibindi ni ibyo wavuze. |
| `plan.sourceUser` | from you | byawe |
| `plan.sourceAi` | suggested by ORDINA | byatanzwe na ORDINA |
| `plan.sourceHabit` | based on your habits | bishingiye ku byo usanzwe ukora |
| `plan.untitled` | Untitled task | Umurimo nta mutwe |
| `plan.edit` | Edit {title} | Hindura {title} |
| `plan.doneEditing` | Done editing | Rangiza guhindura |
| `plan.remove` | Remove {title} from the plan | Kuraho {title} muri gahunda |
| `plan.needsNewTime` | Needs a new time: {time} has already passed today. Tap to change it. | Ukeneye isaha nshya: {time} yarenze uyu munsi. Kanda uyihindure. |
| `plan.thisTime` | this time | iyi saha |
| `plan.fromYou` | (from you) | (byawe) |
| `plan.overlaps` | Overlaps with {titles}. | Bihura na {titles}. |
| `plan.questions_one` | One question before I can plan everything | Ikibazo kimwe mbere yo gutegura byose |
| `plan.questions_other` | {count} questions before I can plan everything | Ibibazo {count} mbere yo gutegura byose |
| `plan.answerPlaceholder` | Or type your answer | Cyangwa wandike igisubizo cyawe |
| `plan.answerLabel` | Answer: {question} | Igisubizo: {question} |
| `plan.updating` | Updating plan… | Gahunda irimo kuvugururwa… |
| `plan.updateWithAnswers` | Update plan with my answers | Vugurura gahunda ukoresheje ibisubizo byanjye |
| `plan.blocked_one` | 1 task needs a new time before you can save. | Umurimo 1 ukeneye isaha nshya mbere yo kubika. |
| `plan.blocked_other` | {count} tasks need a new time before you can save. | Imirimo {count} ikeneye isaha nshya mbere yo kubika. |
| `plan.empty` | No tasks left in this plan. | Nta mirimo isigaye muri iyi gahunda. |
| `plan.assumed` | What I assumed | Ibyo nakekaga |
| `plan.adding` | Adding… | Birongerwaho… |
| `plan.add_one` | Add 1 task to my plan | Ongeraho umurimo 1 kuri gahunda yanjye |
| `plan.add_other` | Add {count} tasks to my plan | Ongeraho imirimo {count} kuri gahunda yanjye |
| `plan.prevDay` | Previous day | Umunsi ubanza |
| `plan.nextDay` | Next day | Umunsi ukurikira |
| `plan.earlier` | 15 minutes earlier | Iminota 15 mbere |
| `plan.later` | 15 minutes later | Iminota 15 nyuma |
| `plan.start` | Start | Gutangira |

### reminders

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `reminders.none` | None | Nta kwibutswa |
| `reminders.start` | At start time | Igihe utangira |
| `reminders.min5` | 5 min before | Iminota 5 mbere |
| `reminders.min15` | 15 min before | Iminota 15 mbere |
| `reminders.min30` | 30 min before | Iminota 30 mbere |
| `reminders.hour1` | 1 hour before | Isaha 1 mbere |
| `reminders.day1` | 1 day before | Umunsi 1 mbere |
| `reminders.custom` | Custom time | Hitamo igihe |
| `reminders.pickTime` | Pick a reminder time | Hitamo igihe cyo kwibutswa |
| `reminders.customAt` | At {moment} | {moment} |
| `reminders.anytimeHint` | Anytime tasks remind you at a time you pick. | Imirimo idafite isaha ikwibutsa ku isaha wihitiyemo. |
| `reminders.off` | Reminders are off in Settings. | Kwibutswa kwafunzwe mu igenamiterere. |
| `reminders.permissionTitle` | Allow reminders? | Kwemera kwibutswa? |
| `reminders.permissionBody` | ORDINA sends a notification at the time you choose, even without internet. You can turn this off at any time. | ORDINA ikoherereza ubutumwa ku isaha wahisemo, kabone n’iyo nta interineti. Ushobora kubihagarika igihe cyose. |
| `reminders.allow` | Allow | Emera |
| `reminders.deniedTitle` | Notifications are blocked | Ubutumwa bwafunzwe |
| `reminders.deniedBody` | To get reminders, open your phone settings → Apps → ORDINA AI → Notifications, and allow them. | Kugira ngo wibutswe, fungura igenamiterere rya telefoni → Apps → ORDINA AI → Notifications, maze ubyemere. |
| `reminders.unavailable` | Reminders are not available on this device. | Kwibutswa ntibikora kuri iyi telefoni. |
| `reminders.notificationBody` | {day} at {time} | {day} saa {time} |
| `reminders.notificationAnytime` | Planned for {day} | Biteganyijwe {day} |
| `reminders.channel` | ORDINA reminders | Kwibutswa kwa ORDINA |
| `reminders.inPast` | This reminder time has already passed. | Iki gihe cyo kwibutswa cyarenze. |

### offline

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `offline.banner` | Offline | Nta interineti |
| `offline.title` | You're offline. | Nta interineti ufite. |
| `offline.message` | Please connect to the internet to plan with ORDINA AI. You can still add tasks manually. | Fungura interineti kugira ngo utegure na ORDINA AI. Ushobora gukomeza kongeraho imirimo wenyine. |
| `offline.addManually` | Add a task manually | Ongeraho umurimo wenyine |

### lock

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `lock.title` | Welcome back | Murakaza neza |
| `lock.subtitle` | Enter your ORDINA passkey to continue. | Andika umubare w’ibanga wa ORDINA kugira ngo ukomeze. |
| `lock.createTitle` | Create a passkey | Kora umubare w’ibanga |
| `lock.createBody` | This 4-digit passkey unlocks ORDINA on this device. It is not your account password. | Uyu mubare w’ibanga w’imibare 4 ufungura ORDINA kuri iyi telefoni. Si ijambobanga rya konti yawe. |
| `lock.confirmTitle` | Confirm passkey | Emeza umubare w’ibanga |
| `lock.confirmBody` | Enter the same 4 digits again. | Ongera wandike imibare 4 imwe. |
| `lock.mismatch` | Passkeys do not match. Try again. | Imibare y’ibanga ntihuye. Ongera ugerageze. |
| `lock.incorrect` | Incorrect passkey. | Umubare w’ibanga si wo. |
| `lock.attemptsLeft` | {n} attempts left | Usigaje kugerageza inshuro {n} |
| `lock.lockedTitle` | ORDINA is locked | ORDINA yafunzwe |
| `lock.lockedBody` | Three incorrect passkeys. Try again in {time}. | Wibeshye inshuro eshatu. Ongera ugerageze nyuma ya {time}. |
| `lock.lockedExit` | The app will close. Open ORDINA again after 3 minutes. | Porogaramu irafunga. Ongera ufungure ORDINA nyuma y’iminota 3. |
| `lock.save` | Save passkey | Bika umubare w’ibanga |
| `lock.unlock` | Unlock | Fungura |
| `lock.digit` | Digit {n} | Umubare wa {n} |
| `lock.deleteDigit` | Delete last digit | Siba umubare wa nyuma |

### language

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `language.title` | Language | Ururimi |
| `language.subtitle` | Choose the language ORDINA uses. The whole app changes right away. | Hitamo ururimi ORDINA ikoresha. Porogaramu yose ihinduka ako kanya. |
| `language.change` | Change language | Hindura ururimi |
| `language.current` | Language: {name} | Ururimi: {name} |

### theme

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `theme.title` | Theme | Isura |
| `theme.light` | Light | Urumuri |
| `theme.dark` | Dark | Umwijima |
| `theme.system` | System | Nk’iya telefoni |
| `theme.toggle` | Switch appearance | Hindura isura |

### serverErrors

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `serverErrors.AI_NOT_CONFIGURED` | ORDINA AI is not available right now. You can still add tasks yourself. | ORDINA AI ntiboneka ubu. Ushobora gukomeza kongeraho imirimo wenyine. |
| `serverErrors.AI_KEY_REJECTED` | ORDINA AI is not available right now. You can still add tasks yourself. | ORDINA AI ntiboneka ubu. Ushobora gukomeza kongeraho imirimo wenyine. |
| `serverErrors.AI_QUOTA` | ORDINA AI has reached its usage limit for now. Please try again later. | ORDINA AI yageze ku rugero rwayo rw’ikoreshwa. Ongera ugerageze nyuma. |
| `serverErrors.AI_BUSY` | ORDINA AI is very busy right now. Please try again in a moment. | ORDINA AI ifite akazi kenshi ubu. Ongera ugerageze mu kanya. |
| `serverErrors.AI_TIMEOUT` | ORDINA AI took too long to answer. Please try again. | ORDINA AI yatinze gusubiza. Ongera ugerageze. |
| `serverErrors.AI_SAFETY` | ORDINA AI can’t help with that request. Try describing your tasks differently. | ORDINA AI ntishobora gufasha kuri icyo kibazo. Gerageza gusobanura imirimo yawe ukundi. |
| `serverErrors.AI_EMPTY` | ORDINA AI sent back an answer we couldn’t use. Please try again. | ORDINA AI yohereje igisubizo kidakoreshwa. Ongera ugerageze. |
| `serverErrors.AI_INVALID` | ORDINA AI sent back an answer we couldn’t use. Please try again. | ORDINA AI yohereje igisubizo kidakoreshwa. Ongera ugerageze. |
| `serverErrors.AI_BAD_REQUEST` | ORDINA AI couldn’t read that request. Try rephrasing it. | ORDINA AI ntiyasobanukiwe n’icyo usaba. Gerageza kucyandika ukundi. |
| `serverErrors.AI_ERROR` | Something went wrong while planning. Please try again. | Habaye ikibazo mu gutegura. Ongera ugerageze. |
| `serverErrors.MESSAGE_REQUIRED` | Tell ORDINA what you need to get done. | Bwira ORDINA icyo ukeneye gukora. |
| `serverErrors.MESSAGE_TOO_LONG` | That is a bit long. Please keep it under 2,000 characters. | Ni birebire cyane. Koresha inyuguti zitarenze 2.000. |
| `serverErrors.RATE_LIMITED` | Too many attempts. Please wait a few minutes and try again. | Wagerageje inshuro nyinshi. Tegereza iminota mike wongere ugerageze. |
| `serverErrors.EMAIL_TAKEN` | An account with this email already exists. Try logging in. | Hari konti isanzwe ikoresha iyi imeri. Gerageza kwinjira. |
| `serverErrors.INVALID_LOGIN` | Wrong email or password. | Imeri cyangwa ijambobanga si byo. |
| `serverErrors.INVALID_EMAIL` | Please enter a valid email address. | Andika imeri nyayo. |
| `serverErrors.WEAK_PASSWORD` | Use at least 8 characters for your password. | Ijambobanga rigomba kugira nibura inyuguti 8. |
| `serverErrors.NAME_REQUIRED` | Please enter your full name. | Andika amazina yawe yose. |
| `serverErrors.INVALID_CODE` | This code is wrong or has expired. Ask for a new one. | Iyi kode si yo cyangwa yarengeje igihe. Saba indi nshya. |
| `serverErrors.RESET_UNAVAILABLE` | Password reset by email is not available yet. Please try again later. | Guhindura ijambobanga ukoresheje imeri ntibirashoboka. Ongera ugerageze nyuma. |
| `serverErrors.WRONG_PASSWORD` | Your current password is not correct. | Ijambobanga ryawe rya none si ryo. |
| `serverErrors.SESSION_EXPIRED` | Your session has expired. Please log in again. | Igihe cyawe cyarangiye. Ongera winjire. |
| `serverErrors.SYNC_INVALID` | Some of your data could not be backed up. Please try again. | Bimwe mu bikubiyemo ntibyabitswe. Ongera ugerageze. |
| `serverErrors.SERVER_ERROR` | The ORDINA server had a problem. Please try again. | Seriveri ya ORDINA yagize ikibazo. Ongera ugerageze. |

### errors

| Key | English | Kinyarwanda |
| --- | --- | --- |
| `errors.generic` | Something went wrong. Please try again. | Habaye ikibazo. Ongera ugerageze. |
| `errors.load` | Could not load your tasks. | Ntibyashobotse gufungura imirimo yawe. |
| `errors.save` | Unable to save the task. Please try again. | Ntibyashobotse kubika umurimo. Ongera ugerageze. |
| `errors.update` | Could not update the task. Please try again. | Ntibyashobotse guhindura umurimo. Ongera ugerageze. |
| `errors.delete` | Could not delete the task. Please try again. | Ntibyashobotse gusiba umurimo. Ongera ugerageze. |
| `errors.sessionExpired` | Your session has expired. Please sign in again. | Igihe cyawe cyarangiye. Ongera winjire. |
| `errors.timeout` | The server took too long to answer. Please try again. | Seriveri yatinze gusubiza. Ongera ugerageze. |
| `errors.network` | Cannot reach the ORDINA server. Check your connection and try again. | Ntibyashobotse kugera kuri seriveri ya ORDINA. Reba interineti yawe wongere ugerageze. |
| `errors.titleRequired` | Please add a task title. | Andika umutwe w’umurimo. |
| `errors.titleTooLong` | Keep the title under {max} characters. | Umutwe ugomba kuba munsi y’inyuguti {max}. |
| `errors.descriptionTooLong` | Keep the description under {max} characters. | Ibisobanuro bigomba kuba munsi y’inyuguti {max}. |
| `errors.invalidDate` | Please choose a valid date. | Hitamo itariki nyayo. |
| `errors.invalidTime` | Please choose a valid time. | Hitamo isaha nyayo. |
| `errors.invalidDuration` | Duration must be between 5 minutes and 12 hours. | Igihe kigomba kuba hagati y’iminota 5 n’amasaha 12. |
