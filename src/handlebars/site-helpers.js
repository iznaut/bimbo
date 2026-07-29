import _ from "lodash"
import moment from "moment"
import * as feather from "feather-icons"

export default {
    formatDate: function (date) {
        return moment(date).utc().format(buildData.site.dateFormat) // TODO point to validator
    },
    getIcon: function (name, options) {
        let icon = feather.icons[name]
        icon.attrs = { ...icon.attrs, ...options.hash }
        return icon.toSvg()
    },
    useFirstValid: function () {
        // TODO get rid of this
        const valid = _.filter(arguments, (arg) => {
            return _.isString(arg)
        })

        return valid[0]
    },
    isCollectionSortAscending: function (name, key) {
        const SORTS = _.find(
            projects.active.collections_meta,
            (v) => v.name == name,
        ).sort

        const ORDER = _.find(SORTS, (v) => v.key == key).order

        return ORDER == "ascending"
    },
}
